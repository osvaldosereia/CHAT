create or replace function public.get_customer_context_v1(p_customer_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
with base as (
  select c.id, c.organization_id, c.display_name, c.first_name, c.status
  from customers c
  where c.id = p_customer_id
),
order_stats as (
  select
    count(*)::int as orders_count,
    coalesce(sum(o.total_cents),0)::bigint as lifetime_value_cents,
    coalesce(round(avg(o.total_cents))::bigint,0) as average_order_value_cents,
    max(o.created_at) as last_order_at
  from orders o
  where o.customer_id = p_customer_id
    and o.status <> 'cancelled'
),
intervals as (
  select avg(extract(epoch from (created_at - previous_at))/86400.0) as average_reorder_days
  from (
    select created_at, lag(created_at) over (order by created_at) as previous_at
    from orders
    where customer_id = p_customer_id
      and status <> 'cancelled'
  ) q
  where previous_at is not null
),
last_order as (
  select jsonb_build_object(
    'id',o.id,
    'orderNumber',o.order_number,
    'totalCents',o.total_cents,
    'createdAt',o.created_at,
    'deliveryAddress',o.delivery_address_snapshot,
    'paymentMethod',o.payment_method_snapshot,
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'kind',oi.item_kind,
          'productId',oi.product_id,
          'basketId',oi.basket_id,
          'name',oi.name_snapshot,
          'quantity',oi.quantity,
          'unitPriceCents',oi.unit_price_cents,
          'totalCents',oi.total_cents,
          'components',case
            when oi.item_kind='basket' then coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'productId',oic.product_id,
                  'name',oic.name_snapshot,
                  'quantity',oic.quantity
                )
                order by oic.id
              )
              from order_item_components oic
              where oic.order_item_id=oi.id
            ),'[]'::jsonb)
            else '[]'::jsonb
          end
        )
        order by oi.id
      )
      from order_items oi
      where oi.order_id=o.id
    ),'[]'::jsonb)
  ) as value
  from orders o
  where o.customer_id=p_customer_id
    and o.status <> 'cancelled'
  order by o.created_at desc
  limit 1
),
purchased_products as (
  select
    oi.product_id,
    oi.name_snapshot as name,
    oi.quantity,
    oi.order_id,
    o.created_at
  from order_items oi
  join orders o on o.id=oi.order_id
  where o.customer_id=p_customer_id
    and oi.product_id is not null
    and o.status <> 'cancelled'

  union all

  select
    oic.product_id,
    oic.name_snapshot as name,
    oic.quantity,
    oi.order_id,
    o.created_at
  from order_item_components oic
  join order_items oi on oi.id=oic.order_item_id
  join orders o on o.id=oi.order_id
  where o.customer_id=p_customer_id
    and oic.product_id is not null
    and o.status <> 'cancelled'
),
top_products as (
  select coalesce(jsonb_agg(x.value order by x.purchase_count desc, x.last_purchase_at desc),'[]'::jsonb) as value
  from (
    select
      jsonb_build_object(
        'productId',pp.product_id,
        'name',(array_agg(pp.name order by pp.created_at desc))[1],
        'purchaseCount',count(distinct pp.order_id),
        'totalQuantity',sum(pp.quantity),
        'lastPurchaseAt',max(pp.created_at)
      ) as value,
      count(distinct pp.order_id) as purchase_count,
      max(pp.created_at) as last_purchase_at
    from purchased_products pp
    group by pp.product_id
    order by purchase_count desc, last_purchase_at desc
    limit 10
  ) x
),
favorite_basket as (
  select oi.basket_id, oi.name_snapshot, count(distinct oi.order_id) as purchase_count, max(o.created_at) as last_purchase_at
  from order_items oi
  join orders o on o.id=oi.order_id
  where o.customer_id=p_customer_id
    and oi.item_kind='basket'
    and oi.basket_id is not null
    and o.status <> 'cancelled'
  group by oi.basket_id, oi.name_snapshot
  order by purchase_count desc, last_purchase_at desc
  limit 1
),
prefs as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'key',preference_key,
      'value',value,
      'source',source,
      'confidence',confidence
    )
    order by updated_at desc
  ),'[]'::jsonb) as value
  from customer_preferences
  where customer_id=p_customer_id
)
select case when b.id is null then null else jsonb_build_object(
  'customerId',b.id,
  'displayName',b.display_name,
  'firstName',b.first_name,
  'status',b.status,
  'ordersCount',s.orders_count,
  'lifetimeValueCents',s.lifetime_value_cents,
  'averageOrderValueCents',s.average_order_value_cents,
  'lastOrderAt',s.last_order_at,
  'averageReorderDays',case when i.average_reorder_days is null then null else round(i.average_reorder_days::numeric,1) end,
  'lastOrder',(select value from last_order),
  'favoriteBasket',(select jsonb_build_object(
      'basketId',fb.basket_id,
      'name',fb.name_snapshot,
      'purchaseCount',fb.purchase_count,
      'lastPurchaseAt',fb.last_purchase_at
    ) from favorite_basket fb),
  'topProducts',(select value from top_products),
  'preferences',(select value from prefs)
) end
from base b
cross join order_stats s
cross join intervals i;
$function$;

revoke all on function public.get_customer_context_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_customer_context_v1(uuid) to service_role;

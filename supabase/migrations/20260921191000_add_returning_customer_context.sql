
alter table public_chat_sessions
  add column if not exists visitor_hash text;

create index if not exists public_chat_sessions_visitor_idx
  on public_chat_sessions(organization_id, visitor_hash)
  where visitor_hash is not null;

create or replace function public.get_customer_context_v1(p_customer_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
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
          'totalCents',oi.total_cents
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
top_products as (
  select coalesce(jsonb_agg(x.value order by x.purchase_count desc, x.last_purchase_at desc),'[]'::jsonb) as value
  from (
    select
      jsonb_build_object(
        'productId',oi.product_id,
        'name',max(oi.name_snapshot),
        'purchaseCount',count(distinct oi.order_id),
        'totalQuantity',sum(oi.quantity),
        'lastPurchaseAt',max(o.created_at)
      ) as value,
      count(distinct oi.order_id) as purchase_count,
      max(o.created_at) as last_purchase_at
    from order_items oi
    join orders o on o.id=oi.order_id
    where o.customer_id=p_customer_id
      and oi.product_id is not null
      and o.status <> 'cancelled'
    group by oi.product_id
    order by purchase_count desc, last_purchase_at desc
    limit 10
  ) x
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
  'topProducts',(select value from top_products),
  'preferences',(select value from prefs)
) end
from base b
cross join order_stats s
cross join intervals i;
$$;

revoke all on function public.get_customer_context_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_customer_context_v1(uuid) to service_role;

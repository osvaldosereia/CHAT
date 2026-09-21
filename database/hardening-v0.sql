-- Chat Commerce OS
-- Hardening v0 for development validation.
-- Adds staff read isolation and FK indexes; writes remain denied unless explicitly allowed.

-- ===== RLS: tenant-scoped read policies =====

drop policy if exists organization_modules_select_member on organization_modules;
create policy organization_modules_select_member
on organization_modules for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = organization_modules.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists customer_identities_select_member on customer_identities;
create policy customer_identities_select_member
on customer_identities for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = customer_identities.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists customer_addresses_select_member on customer_addresses;
create policy customer_addresses_select_member
on customer_addresses for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = customer_addresses.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists customer_consents_select_member on customer_consents;
create policy customer_consents_select_member
on customer_consents for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = customer_consents.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists conversations_select_member on conversations;
create policy conversations_select_member
on conversations for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = conversations.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists messages_select_member on messages;
create policy messages_select_member
on messages for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = messages.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists products_select_member on products;
create policy products_select_member
on products for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = products.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists baskets_select_member on baskets;
create policy baskets_select_member
on baskets for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = baskets.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists basket_items_select_member on basket_items;
create policy basket_items_select_member
on basket_items for select to authenticated
using (
  exists (
    select 1
    from baskets b
    join organization_memberships m on m.organization_id = b.organization_id
    where b.id = basket_items.basket_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists offers_select_member on offers;
create policy offers_select_member
on offers for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = offers.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists carts_select_member on carts;
create policy carts_select_member
on carts for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = carts.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists cart_items_select_member on cart_items;
create policy cart_items_select_member
on cart_items for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = cart_items.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists orders_select_member on orders;
create policy orders_select_member
on orders for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = orders.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists order_items_select_member on order_items;
create policy order_items_select_member
on order_items for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = order_items.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists customer_events_select_member on customer_events;
create policy customer_events_select_member
on customer_events for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = customer_events.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists customer_preferences_select_member on customer_preferences;
create policy customer_preferences_select_member
on customer_preferences for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id = customer_preferences.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

-- ===== Performance: covering indexes for foreign keys / common relations =====

create index if not exists baskets_organization_idx on baskets(organization_id);
create index if not exists basket_items_product_idx on basket_items(product_id);

create index if not exists customer_addresses_organization_idx on customer_addresses(organization_id);
create index if not exists customer_addresses_customer_idx on customer_addresses(customer_id);
create index if not exists customer_consents_organization_idx on customer_consents(organization_id);
create index if not exists customer_consents_customer_idx on customer_consents(customer_id);

create index if not exists messages_organization_idx on messages(organization_id);

create index if not exists offers_organization_idx on offers(organization_id);
create index if not exists offers_product_idx on offers(product_id);

create index if not exists carts_organization_idx on carts(organization_id);
create index if not exists carts_customer_idx on carts(customer_id);
create index if not exists carts_conversation_idx on carts(conversation_id);

create index if not exists cart_items_organization_idx on cart_items(organization_id);
create index if not exists cart_items_cart_idx on cart_items(cart_id);
create index if not exists cart_items_product_idx on cart_items(product_id);
create index if not exists cart_items_basket_idx on cart_items(basket_id);

create index if not exists orders_conversation_idx on orders(conversation_id);
create index if not exists orders_source_cart_idx on orders(source_cart_id);

create index if not exists order_items_organization_idx on order_items(organization_id);
create index if not exists order_items_order_idx on order_items(order_id);
create index if not exists order_items_product_idx on order_items(product_id);
create index if not exists order_items_basket_idx on order_items(basket_id);

create index if not exists customer_events_conversation_idx on customer_events(conversation_id);
create index if not exists customer_preferences_organization_idx on customer_preferences(organization_id);

-- Idempotency for client retries.
create unique index if not exists messages_client_idempotency_idx
  on messages(conversation_id, client_message_id)
  where client_message_id is not null;

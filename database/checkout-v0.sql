-- Chat Commerce OS — Checkout + basket component history v0

alter table customer_addresses
  add column if not exists raw_text text;

create table if not exists checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null unique references conversations(id) on delete cascade,
  cart_id uuid not null references carts(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  state text not null default 'collect_name'
    check (state in ('collect_name','collect_phone','collect_address','collect_payment','review','confirmed','cancelled')),
  customer_name text,
  phone_normalized text,
  address_raw text,
  payment_method text,
  status text not null default 'active'
    check (status in ('active','confirmed','cancelled','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists checkout_sessions_organization_idx
  on checkout_sessions(organization_id,status);
create index if not exists checkout_sessions_customer_idx
  on checkout_sessions(customer_id)
  where customer_id is not null;

alter table checkout_sessions enable row level security;

drop policy if exists checkout_sessions_select_member on checkout_sessions;
create policy checkout_sessions_select_member
on checkout_sessions for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id=checkout_sessions.organization_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);

create table if not exists order_item_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name_snapshot text not null,
  sku_snapshot text,
  quantity numeric not null check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_item_components_organization_idx
  on order_item_components(organization_id);
create index if not exists order_item_components_order_item_idx
  on order_item_components(order_item_id);
create index if not exists order_item_components_product_idx
  on order_item_components(product_id)
  where product_id is not null;

alter table order_item_components enable row level security;

drop policy if exists order_item_components_select_member on order_item_components;
create policy order_item_components_select_member
on order_item_components for select to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id=order_item_components.organization_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);

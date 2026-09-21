-- Chat Commerce OS
-- Schema de desenho v0.
-- Não é migration oficial. A primeira migration será gerada quando o novo projeto
-- Supabase estiver definido e este desenho tiver sido validado em banco de desenvolvimento.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_memberships (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner','admin','manager','agent','viewer')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_memberships_user_idx
  on organization_memberships(user_id, status);

create table if not exists organization_modules (
  organization_id uuid not null references organizations(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, module_key)
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  display_name text,
  first_name text,
  last_name text,
  status text not null default 'lead' check (status in ('lead','active','inactive','blocked')),
  birth_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_org_idx on customers(organization_id);

create table if not exists customer_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  kind text not null check (kind in ('phone','cpf','email','web_session','whatsapp','instagram','external')),
  normalized_value text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, kind, normalized_value)
);

create index if not exists customer_identities_customer_idx on customer_identities(customer_id);

create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  label text,
  recipient_name text,
  postal_code text,
  street text,
  number text,
  complement text,
  district text,
  city text,
  state text,
  country_code char(2) not null default 'BR',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  consent_type text not null,
  granted boolean not null,
  source text not null default 'web',
  granted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  channel text not null default 'web',
  external_thread_id text,
  status text not null default 'open' check (status in ('open','waiting_customer','waiting_human','human_active','closed')),
  assigned_user_id uuid,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists conversations_org_status_idx on conversations(organization_id, status, last_message_at desc);
create index if not exists conversations_customer_idx on conversations(customer_id, last_message_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','assistant','human','system')),
  sender_id uuid,
  message_type text not null default 'text',
  body_text text,
  payload jsonb not null default '{}'::jsonb,
  client_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on messages(conversation_id, created_at, id);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sku text,
  gtin text,
  name text not null,
  description text,
  active boolean not null default true,
  sale_price_cents integer not null check (sale_price_cents >= 0),
  stock_quantity numeric,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create index if not exists products_org_active_idx on products(organization_id, active);

create table if not exists baskets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  display_price_cents integer,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists basket_items (
  basket_id uuid not null references baskets(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric not null check (quantity > 0),
  sort_order integer not null default 0,
  primary key (basket_id, product_id)
);

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id uuid not null references products(id),
  title text,
  sale_price_cents integer not null check (sale_price_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  status text not null default 'open' check (status in ('open','converted','abandoned','expired')),
  currency char(3) not null default 'BRL',
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  total_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid references products(id),
  basket_id uuid references baskets(id),
  item_kind text not null check (item_kind in ('product','basket')),
  name_snapshot text not null,
  sku_snapshot text,
  quantity numeric not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  source_cart_id uuid references carts(id) on delete set null,
  order_number bigint generated by default as identity,
  status text not null default 'created',
  currency char(3) not null default 'BRL',
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  delivery_cents integer not null default 0,
  total_cents integer not null default 0,
  delivery_address_snapshot jsonb,
  payment_method_snapshot jsonb,
  confirmed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, order_number)
);

create index if not exists orders_customer_idx on orders(customer_id, created_at desc);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  basket_id uuid references baskets(id),
  item_kind text not null check (item_kind in ('product','basket')),
  name_snapshot text not null,
  sku_snapshot text,
  quantity numeric not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists customer_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists customer_events_customer_idx on customer_events(customer_id, occurred_at desc);
create index if not exists customer_events_org_type_idx on customer_events(organization_id, event_type, occurred_at desc);

create table if not exists customer_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  preference_key text not null,
  value jsonb not null,
  source text not null check (source in ('declared','observed','system')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, preference_key, source)
);

-- RLS será ativada e as policies serão escritas/testadas na primeira migration oficial,
-- quando Auth, memberships e o projeto Supabase estiverem definidos.

-- Chat Commerce OS — Foundation baseline
-- Validated transactionally against project qxstkwshuvplmmftrctj on 2026-09-21.

-- ===== database/schema-v0.sql =====
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



-- ===== database/rls-v0.sql =====
-- Chat Commerce OS
-- RLS design v0 — NÃO APLICAR EM PRODUÇÃO.
-- Deve ser validado no novo projeto Supabase e convertido em migration oficial.

-- Estratégia:
-- 1) equipe autenticada acessa apenas organizações em que tem membership ativa;
-- 2) chat público não recebe CRUD direto nas tabelas centrais;
-- 3) operações públicas passam pelo gateway/backend.

alter table organizations enable row level security;
alter table organization_memberships enable row level security;
alter table organization_modules enable row level security;
alter table customers enable row level security;
alter table customer_identities enable row level security;
alter table customer_addresses enable row level security;
alter table customer_consents enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table products enable row level security;
alter table baskets enable row level security;
alter table basket_items enable row level security;
alter table offers enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table customer_events enable row level security;
alter table customer_preferences enable row level security;

-- Membership: o usuário pode ver suas próprias memberships.
drop policy if exists organization_memberships_select_own on organization_memberships;
create policy organization_memberships_select_own
on organization_memberships
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Organizations: usuário vê somente organizações de que é membro ativo.
drop policy if exists organizations_select_member on organizations;
create policy organizations_select_member
on organizations
for select
to authenticated
using (
  exists (
    select 1
    from organization_memberships m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

-- Padrão das tabelas tenant-scoped.
-- Exemplo em customers. O mesmo padrão será aplicado explicitamente por tabela
-- após testes para evitar policies genéricas difíceis de auditar.
drop policy if exists customers_select_member on customers;
create policy customers_select_member
on customers
for select
to authenticated
using (
  exists (
    select 1
    from organization_memberships m
    where m.organization_id = customers.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists customers_insert_staff on customers;
create policy customers_insert_staff
on customers
for insert
to authenticated
with check (
  exists (
    select 1
    from organization_memberships m
    where m.organization_id = customers.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','agent')
  )
);

drop policy if exists customers_update_staff on customers;
create policy customers_update_staff
on customers
for update
to authenticated
using (
  exists (
    select 1
    from organization_memberships m
    where m.organization_id = customers.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','agent')
  )
)
with check (
  exists (
    select 1
    from organization_memberships m
    where m.organization_id = customers.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner','admin','manager','agent')
  )
);

-- Nenhuma policy anon é criada aqui de propósito.
-- O gateway público será responsável pelo fluxo do cliente.



-- ===== database/hardening-v0.sql =====
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



-- ===== database/chat-core-v0.sql =====
-- Chat Commerce OS — Chat Core v0 (development validation)
-- Public sessions are accessed only through chat-gateway-v1.

create table if not exists public_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null unique references conversations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','expired','revoked')),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists public_chat_sessions_org_idx
  on public_chat_sessions(organization_id, status);

create index if not exists public_chat_sessions_customer_idx
  on public_chat_sessions(customer_id)
  where customer_id is not null;

alter table public_chat_sessions enable row level security;

revoke all on public_chat_sessions from anon, authenticated;

drop policy if exists public_chat_sessions_deny_anon on public_chat_sessions;
create policy public_chat_sessions_deny_anon
on public_chat_sessions
for all
to anon
using (false)
with check (false);

drop policy if exists public_chat_sessions_deny_authenticated on public_chat_sessions;
create policy public_chat_sessions_deny_authenticated
on public_chat_sessions
for all
to authenticated
using (false)
with check (false);



-- ===== database/checkout-v0.sql =====
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



-- ===== database/public-rate-limit-v0.sql =====

create schema if not exists private;

create table if not exists private.public_rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, window_start)
);

create or replace function public.consume_public_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_key_hash is null or length(p_key_hash) < 16 then
    return false;
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.public_rate_limits(key_hash, window_start, request_count, updated_at)
  values (p_key_hash, v_window, 1, now())
  on conflict (key_hash, window_start)
  do update
    set request_count = private.public_rate_limits.request_count + 1,
        updated_at = now()
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, integer, integer)
  to service_role;



-- ===== database/catalog-search-v0.sql =====
-- Full catalog search support v0
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

alter table products
  add column if not exists search_text text not null default '';

create index if not exists products_search_text_trgm_idx
  on products using gin (search_text extensions.gin_trgm_ops);



-- ===== database/catalog-search-backfill-v0.sql =====
create extension if not exists unaccent with schema extensions;

update products
set search_text = trim(
  regexp_replace(
    extensions.unaccent(
      lower(
        concat_ws(
          ' ',
          name,
          sku,
          gtin,
          metadata->>'brand',
          metadata->>'category',
          metadata->>'subcategory',
          metadata->>'subsubcategory'
        )
      )
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  )
);



-- ===== database/performance-fix-v0.sql =====
-- Development hardening
create index if not exists checkout_sessions_cart_idx on checkout_sessions(cart_id);



-- ===== database/search-hardening-v0.sql =====
-- Move pg_trgm out of public for security hygiene.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;



-- ===== database/data-quality-v0.sql =====

-- Corrige ofertas ativas inválidas.
update offers o
set active = false
from products p
where p.id = o.product_id
  and o.active = true
  and o.sale_price_cents >= p.sale_price_cents;

-- Impede valores negativos/zero; a comparação com preço regular é validada
-- na camada de domínio porque depende da tabela products.
alter table offers
  drop constraint if exists offers_sale_price_positive_chk;

alter table offers
  add constraint offers_sale_price_positive_chk
  check (sale_price_cents > 0);


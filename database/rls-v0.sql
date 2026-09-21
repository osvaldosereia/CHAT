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
create policy organization_memberships_select_own
on organization_memberships
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Organizations: usuário vê somente organizações de que é membro ativo.
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

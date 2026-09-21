create table if not exists organization_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  brand_name text not null,
  assistant_name text,
  locale text not null default 'pt-BR',
  currency char(3) not null default 'BRL',
  timezone text not null default 'America/Cuiaba',
  commerce_configuration jsonb not null default '{}'::jsonb,
  experience_configuration jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table organization_settings enable row level security;

drop policy if exists organization_settings_select_member on organization_settings;
create policy organization_settings_select_member
on organization_settings for select to authenticated
using (exists (
  select 1 from organization_memberships m
  where m.organization_id=organization_settings.organization_id
    and m.user_id=(select auth.uid())
    and m.status='active'
));

insert into organization_settings (
  organization_id,
  brand_name,
  assistant_name,
  locale,
  currency,
  timezone,
  commerce_configuration,
  experience_configuration
)
select
  id,
  'Dona Antônia',
  'Assistente Dona Antônia',
  'pt-BR',
  'BRL',
  'America/Cuiaba',
  '{
    "primary_focus":"baskets",
    "delivery_cities":["Cuiabá","Várzea Grande"],
    "payment_timing":"on_delivery",
    "payment_methods":["pix","cash","credit_card","meal_card"]
  }'::jsonb,
  '{
    "conversation_style":"humanized_compact",
    "max_primary_recommendations":3,
    "show_human_handoff":true
  }'::jsonb
from organizations
where slug='dona-antonia'
on conflict (organization_id) do update
set brand_name=excluded.brand_name,
    assistant_name=excluded.assistant_name,
    locale=excluded.locale,
    currency=excluded.currency,
    timezone=excluded.timezone,
    commerce_configuration=excluded.commerce_configuration,
    experience_configuration=excluded.experience_configuration,
    updated_at=now();

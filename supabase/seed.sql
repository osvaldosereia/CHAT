-- Chat Commerce OS — development seed
-- First tenant: Dona Antônia

with org as (
  insert into organizations (name, slug, status)
  values ('Dona Antônia', 'dona-antonia', 'active')
  on conflict (slug) do update
    set name = excluded.name,
        status = excluded.status,
        updated_at = now()
  returning id
),
resolved_org as (
  select id from org
  union all
  select id from organizations where slug='dona-antonia'
  limit 1
)
insert into organization_modules (organization_id, module_key, enabled, configuration)
select id, module_key, enabled, '{}'::jsonb
from resolved_org
cross join (
  values
    ('chat', true),
    ('customers', true),
    ('catalog', true),
    ('baskets', true),
    ('offers', true),
    ('cart', true),
    ('orders', true),
    ('human_inbox', true),
    ('ai', true),
    ('automation', false),
    ('analytics', false),
    ('whatsapp', false),
    ('instagram', false)
) as m(module_key, enabled)
on conflict (organization_id, module_key)
do update set
  enabled = excluded.enabled,
  configuration = excluded.configuration,
  updated_at = now();

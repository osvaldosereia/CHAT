-- AI Core v1: configuration, prompt versioning and audit.
create table if not exists ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_key text not null,
  name text not null,
  purpose text,
  provider text not null default 'openai',
  model text not null default 'gpt-5.6-luna',
  enabled boolean not null default false,
  reasoning_effort text not null default 'none'
    check (reasoning_effort in ('none','low','medium','high')),
  max_output_tokens integer not null default 300 check (max_output_tokens between 64 and 4000),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, agent_key)
);

create table if not exists ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references ai_agents(id) on delete cascade,
  version integer not null check (version > 0),
  instructions text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

create unique index if not exists ai_prompt_versions_one_active_idx
  on ai_prompt_versions(agent_id)
  where active;

create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references ai_agents(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  provider text not null,
  model text not null,
  status text not null check (status in ('started','completed','failed','skipped')),
  request_kind text not null default 'intent_router',
  provider_response_id text,
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  ai_run_id uuid references ai_runs(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  tool_name text not null,
  status text not null check (status in ('started','completed','failed','rejected')),
  arguments jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_agents_org_idx on ai_agents(organization_id,enabled);
create index if not exists ai_prompt_versions_agent_idx on ai_prompt_versions(agent_id,version desc);
create index if not exists ai_runs_conversation_idx on ai_runs(conversation_id,created_at desc);
create index if not exists ai_runs_customer_idx on ai_runs(customer_id,created_at desc);
create index if not exists ai_tool_calls_run_idx on ai_tool_calls(ai_run_id,created_at);

alter table ai_agents enable row level security;
alter table ai_prompt_versions enable row level security;
alter table ai_runs enable row level security;
alter table ai_tool_calls enable row level security;

drop policy if exists ai_agents_select_member on ai_agents;
create policy ai_agents_select_member on ai_agents
for select to authenticated
using (exists (
  select 1 from organization_memberships m
  where m.organization_id=ai_agents.organization_id
    and m.user_id=(select auth.uid())
    and m.status='active'
));

drop policy if exists ai_prompt_versions_select_member on ai_prompt_versions;
create policy ai_prompt_versions_select_member on ai_prompt_versions
for select to authenticated
using (exists (
  select 1 from organization_memberships m
  where m.organization_id=ai_prompt_versions.organization_id
    and m.user_id=(select auth.uid())
    and m.status='active'
));

drop policy if exists ai_runs_select_member on ai_runs;
create policy ai_runs_select_member on ai_runs
for select to authenticated
using (exists (
  select 1 from organization_memberships m
  where m.organization_id=ai_runs.organization_id
    and m.user_id=(select auth.uid())
    and m.status='active'
));

drop policy if exists ai_tool_calls_select_member on ai_tool_calls;
create policy ai_tool_calls_select_member on ai_tool_calls
for select to authenticated
using (exists (
  select 1 from organization_memberships m
  where m.organization_id=ai_tool_calls.organization_id
    and m.user_id=(select auth.uid())
    and m.status='active'
));

with org as (
  select id from organizations where slug='dona-antonia' limit 1
), agent as (
  insert into ai_agents (
    organization_id,agent_key,name,purpose,provider,model,enabled,reasoning_effort,max_output_tokens,configuration
  )
  select
    id,
    'sales_assistant',
    'Assistente de Vendas Dona Antônia',
    'Interpretar mensagens ambíguas do chat commerce e escolher uma intenção segura.',
    'openai',
    'gpt-5.6-luna',
    false,
    'none',
    300,
    '{"activation":"requires_backend_secret","strategy":"deterministic_first_ai_fallback"}'::jsonb
  from org
  on conflict (organization_id,agent_key) do update
    set model=excluded.model,
        purpose=excluded.purpose,
        configuration=excluded.configuration,
        updated_at=now()
  returning id,organization_id
)
insert into ai_prompt_versions (organization_id,agent_id,version,instructions,active)
select
  organization_id,
  id,
  1,
  'Você é o interpretador de intenção do Chat Commerce da Dona Antônia, mercado local de Cuiabá e Várzea Grande. Não invente produtos, preços, estoque, pedidos ou dados do cliente. Sua função é somente entender a mensagem e devolver a intenção estruturada. Prefira respostas curtas e naturais. Quando a pessoa pedir produto por uso ou necessidade, gere um termo de busca objetivo. Quando não houver segurança, use unknown. Nunca peça CPF. Atendimento humano é sempre permitido.',
  true
from agent
on conflict (agent_id,version) do nothing;

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

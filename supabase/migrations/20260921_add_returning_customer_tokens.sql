-- Returning customer recognition for first-party web chat.
create table if not exists returning_customer_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists returning_customer_tokens_customer_idx
  on returning_customer_tokens(organization_id, customer_id, status);

alter table returning_customer_tokens enable row level security;
revoke all on returning_customer_tokens from anon, authenticated;

drop policy if exists returning_customer_tokens_deny_anon on returning_customer_tokens;
create policy returning_customer_tokens_deny_anon
on returning_customer_tokens for all to anon
using (false) with check (false);

drop policy if exists returning_customer_tokens_deny_authenticated on returning_customer_tokens;
create policy returning_customer_tokens_deny_authenticated
on returning_customer_tokens for all to authenticated
using (false) with check (false);

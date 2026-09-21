-- Human inbox foundation v0

alter table organization_memberships
  add column if not exists display_name text;

create table if not exists conversation_assignment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  event_type text not null
    check (event_type in ('claimed','released_to_ai','closed','reopened','transferred')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_assignment_events_conversation_idx
  on conversation_assignment_events(conversation_id,created_at desc);
create index if not exists conversation_assignment_events_org_idx
  on conversation_assignment_events(organization_id,created_at desc);
create index if not exists conversation_assignment_events_actor_idx
  on conversation_assignment_events(actor_user_id)
  where actor_user_id is not null;
create index if not exists conversation_assignment_events_assigned_idx
  on conversation_assignment_events(assigned_user_id)
  where assigned_user_id is not null;

alter table conversation_assignment_events enable row level security;

drop policy if exists conversation_assignment_events_select_member
  on conversation_assignment_events;
create policy conversation_assignment_events_select_member
on conversation_assignment_events
for select
to authenticated
using (
  exists (
    select 1 from organization_memberships m
    where m.organization_id=conversation_assignment_events.organization_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);

-- Writes intentionally remain server-only through admin-inbox-v1.

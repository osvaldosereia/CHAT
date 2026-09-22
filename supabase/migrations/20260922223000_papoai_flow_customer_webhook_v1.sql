-- PapoAI Flow -> cadastro canônico de clientes
create table if not exists public.papoai_flow_customer_webhook_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  correlation_id text not null,
  contact_phone_e164 text,
  contact_name text,
  payload jsonb not null default '{}'::jsonb,
  parsed_data jsonb not null default '{}'::jsonb,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'received',
  error_code text
);

create index if not exists idx_papoai_flow_customer_webhook_events_received_at
  on public.papoai_flow_customer_webhook_events(received_at desc);

create index if not exists idx_papoai_flow_customer_webhook_events_phone
  on public.papoai_flow_customer_webhook_events(contact_phone_e164, received_at desc)
  where contact_phone_e164 is not null;

alter table public.papoai_flow_customer_webhook_events enable row level security;
revoke all on public.papoai_flow_customer_webhook_events from anon, authenticated;

create or replace function public.verify_papoai_flow_customer_webhook_key_v1(p_key text)
returns boolean
language sql
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.system_secrets s
    where s.key_name='papoai_flow_customer_webhook_v1'
      and s.is_active=true
      and lower(s.key_hash)=lower(
        encode(
          extensions.digest(
            convert_to(coalesce(p_key,''),'UTF8'),
            'sha256'
          ),
          'hex'
        )
      )
  );
$$;

revoke all on function public.verify_papoai_flow_customer_webhook_key_v1(text) from public, anon, authenticated;
grant execute on function public.verify_papoai_flow_customer_webhook_key_v1(text) to service_role;

alter table public.customers
  add column email text,
  add column first_contact_at timestamptz not null default now(),
  add column last_interaction_at timestamptz not null default now();

alter table public.conversations
  add column automation_mode text not null default 'ai',
  add column needs_attention boolean not null default false,
  add column attention_reason text;

alter table public.conversations
  add constraint conversations_automation_mode_check
    check (automation_mode in ('ai', 'human', 'paused')),
  add constraint conversations_attention_reason_check
    check (
      (needs_attention = true and nullif(btrim(attention_reason), '') is not null)
      or
      (needs_attention = false and attention_reason is null)
    );

alter table public.customers enable row level security;
alter table public.conversations enable row level security;

create or replace function public.ingest_whatsapp_inbound(
  p_whatsapp_message_id text,
  p_phone text,
  p_customer_name text,
  p_message_type text,
  p_text text,
  p_raw_payload jsonb,
  p_created_at timestamp with time zone
)
returns table(
  accepted boolean,
  stored_message_id uuid,
  customer_id uuid,
  conversation_id uuid
)
language plpgsql
set search_path to ''
as $function$
declare
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_event_at timestamptz := coalesce(p_created_at, now());
begin
  if nullif(trim(p_whatsapp_message_id), '') is null then
    raise exception 'whatsapp message id is required';
  end if;

  if nullif(trim(p_phone), '') is null then
    raise exception 'phone is required';
  end if;

  if p_message_type not in ('text', 'image', 'audio', 'document') then
    raise exception 'unsupported inbound message type';
  end if;

  insert into public.customers (
    name,
    phone,
    normalized_phone,
    whatsapp_id,
    first_contact_at,
    last_interaction_at,
    updated_at
  ) values (
    nullif(trim(p_customer_name), ''),
    p_phone,
    p_phone,
    p_phone,
    v_event_at,
    v_event_at,
    now()
  )
  on conflict (normalized_phone) do update
  set
    name = coalesce(excluded.name, public.customers.name),
    phone = excluded.phone,
    whatsapp_id = coalesce(public.customers.whatsapp_id, excluded.whatsapp_id),
    last_interaction_at = greatest(
      public.customers.last_interaction_at,
      excluded.last_interaction_at
    ),
    updated_at = now()
  returning id into v_customer_id;

  insert into public.conversations (
    customer_id,
    channel,
    status,
    started_at,
    last_message_at,
    updated_at
  ) values (
    v_customer_id,
    'whatsapp',
    'open',
    v_event_at,
    v_event_at,
    now()
  )
  on conflict (customer_id, channel) where status = 'open' do update
  set
    last_message_at = greatest(
      coalesce(public.conversations.last_message_at, excluded.last_message_at),
      excluded.last_message_at
    ),
    updated_at = now()
  returning id into v_conversation_id;

  insert into public.messages (
    conversation_id,
    customer_id,
    direction,
    type,
    text,
    whatsapp_message_id,
    raw_payload,
    created_at
  ) values (
    v_conversation_id,
    v_customer_id,
    'inbound',
    p_message_type,
    p_text,
    p_whatsapp_message_id,
    p_raw_payload,
    v_event_at
  )
  on conflict (whatsapp_message_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id, m.customer_id, m.conversation_id
    into v_message_id, v_customer_id, v_conversation_id
    from public.messages m
    where m.whatsapp_message_id = p_whatsapp_message_id;

    return query select false, v_message_id, v_customer_id, v_conversation_id;
    return;
  end if;

  return query select true, v_message_id, v_customer_id, v_conversation_id;
end;
$function$;

revoke execute on function public.ingest_whatsapp_inbound(text, text, text, text, text, jsonb, timestamp with time zone) from public;
revoke execute on function public.ingest_whatsapp_inbound(text, text, text, text, text, jsonb, timestamp with time zone) from anon;
revoke execute on function public.ingest_whatsapp_inbound(text, text, text, text, text, jsonb, timestamp with time zone) from authenticated;
grant execute on function public.ingest_whatsapp_inbound(text, text, text, text, text, jsonb, timestamp with time zone) to service_role;

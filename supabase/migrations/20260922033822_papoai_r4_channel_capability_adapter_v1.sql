
begin;

create table if not exists public.papoai_channel_runtime_config (
  id smallint primary key default 1 check(id=1),
  enabled boolean not null default false,
  inbound_audio_enabled boolean not null default false,
  inbound_image_enabled boolean not null default false,
  outbound_image_enabled boolean not null default false,
  outbound_voice_enabled boolean not null default false,
  interactive_enabled boolean not null default false,
  typing_enabled boolean not null default false,
  read_receipt_enabled boolean not null default false,
  flow_enabled boolean not null default false,
  transcription_model text not null default 'gpt-4o-mini-transcribe',
  vision_model text not null default 'gpt-5.6-luna',
  vision_detail text not null default 'low' check(vision_detail in ('low','high','auto')),
  tts_model text not null default 'gpt-4o-mini-tts',
  tts_voice text not null default 'marin',
  tts_instructions text not null default 'Fale em português brasileiro, com tom natural, simpático, claro e comercial, sem parecer locução publicitária.',
  max_audio_bytes integer not null default 16777216 check(max_audio_bytes between 1048576 and 26214400),
  max_image_bytes integer not null default 10485760 check(max_image_bytes between 1048576 and 20971520),
  media_storage_bucket text not null default 'shopping-room-media',
  allowed_media_hosts text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.papoai_channel_runtime_config enable row level security;
revoke all on table public.papoai_channel_runtime_config from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_channel_runtime_config to service_role;

insert into public.papoai_channel_runtime_config(
  id,enabled,inbound_audio_enabled,inbound_image_enabled,
  outbound_image_enabled,outbound_voice_enabled,interactive_enabled,
  typing_enabled,read_receipt_enabled,flow_enabled,
  transcription_model,vision_model,vision_detail,tts_model,tts_voice,
  tts_instructions,max_audio_bytes,max_image_bytes,media_storage_bucket,
  allowed_media_hosts,metadata
)
values(
  1,false,false,false,false,false,false,false,false,false,
  'gpt-4o-mini-transcribe','gpt-5.6-luna','low',
  'gpt-4o-mini-tts','marin',
  'Fale em português brasileiro, com tom natural, simpático, claro e comercial, sem parecer locução publicitária.',
  16777216,10485760,'shopping-room-media','{}'::text[],
  jsonb_build_object(
    'architecture','capability_adapter_with_fallbacks',
    'meta_native_reference_verified_on','2026-09-21',
    'media_fetch_policy','deny_until_host_verified',
    'voice_default_policy','text_unless_customer_uses_or_requests_audio',
    'image_generation_during_sales',false,
    'production_activation_authorized',false
  )
)
on conflict(id) do update set
  transcription_model=excluded.transcription_model,
  vision_model=excluded.vision_model,
  vision_detail=excluded.vision_detail,
  tts_model=excluded.tts_model,
  tts_voice=excluded.tts_voice,
  tts_instructions=excluded.tts_instructions,
  max_audio_bytes=excluded.max_audio_bytes,
  max_image_bytes=excluded.max_image_bytes,
  media_storage_bucket=excluded.media_storage_bucket,
  metadata=public.papoai_channel_runtime_config.metadata||excluded.metadata,
  updated_at=now();

create table if not exists public.papoai_channel_delivery_audit (
  id bigserial primary key,
  correlation_id uuid,
  conversation_id uuid references public.conversations(id) on delete set null,
  requested_type text not null,
  resolved_type text not null,
  capability_key text,
  capability_state text,
  fallback_used boolean not null default false,
  fallback_reason text,
  payload_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists papoai_channel_delivery_audit_conversation_created_idx
  on public.papoai_channel_delivery_audit(conversation_id,created_at desc);

alter table public.papoai_channel_delivery_audit enable row level security;
revoke all on table public.papoai_channel_delivery_audit from public,anon,authenticated;
grant select,insert on table public.papoai_channel_delivery_audit to service_role;
grant usage,select on sequence public.papoai_channel_delivery_audit_id_seq to service_role;

create table if not exists public.papoai_media_processing_runs (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  media_kind text not null check(media_kind in ('audio','image')),
  source_url_host text,
  source_mime_type text,
  operation text not null check(operation in ('transcribe','vision','tts')),
  model text,
  detail text,
  success boolean not null default false,
  output_text text,
  input_bytes integer,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists papoai_media_processing_runs_conversation_created_idx
  on public.papoai_media_processing_runs(conversation_id,created_at desc);

alter table public.papoai_media_processing_runs enable row level security;
revoke all on table public.papoai_media_processing_runs from public,anon,authenticated;
grant select,insert,update on table public.papoai_media_processing_runs to service_role;

do $$
declare
  v_adapter_id uuid;
  v_key text;
begin
  select id into v_adapter_id
  from public.channel_provider_adapters
  where provider_key='papoai' and channel='whatsapp'
  order by updated_at desc
  limit 1;

  if v_adapter_id is null then
    raise exception 'papoai_whatsapp_adapter_not_found';
  end if;

  foreach v_key in array array[
    'agent_external.inbound_audio',
    'agent_external.inbound_image',
    'agent_external.outbound_image',
    'agent_external.outbound_voice',
    'agent_external.typing',
    'agent_external.read_receipt',
    'agent_external.button_reply',
    'agent_external.list_reply',
    'agent_external.flow_reply',
    'agent_external.handoff',
    'agent_external.silent'
  ]
  loop
    insert into public.channel_provider_capability_evidence(
      adapter_id,capability_key,state,evidence_source,evidence
    ) values(
      v_adapter_id,v_key,'unknown',null,'{}'::jsonb
    )
    on conflict(adapter_id,capability_key) do nothing;
  end loop;

  update public.channel_provider_capability_evidence
  set state=case
        when state='unknown' then 'observed_ui'
        else state
      end,
      evidence_source=coalesce(evidence_source,'owner_ui_screenshot'),
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
        'derived_from','agent_external.media_reply',
        'response_shape','message.media_url'
      ),
      observed_at=coalesce(observed_at,now()),
      updated_at=now()
  where adapter_id=v_adapter_id
    and capability_key='agent_external.outbound_image'
    and exists(
      select 1
      from public.channel_provider_capability_evidence e2
      where e2.adapter_id=v_adapter_id
        and e2.capability_key='agent_external.media_reply'
        and e2.state='observed_ui'
    );
end $$;

create or replace function public.get_papoai_channel_runtime_config_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select to_jsonb(c)-'allowed_media_hosts'
    ||jsonb_build_object(
      'allowed_media_host_count',coalesce(cardinality(c.allowed_media_hosts),0)
    )
  from public.papoai_channel_runtime_config c
  where c.id=1;
$$;

revoke all on function public.get_papoai_channel_runtime_config_v1()
  from public,anon,authenticated;
grant execute on function public.get_papoai_channel_runtime_config_v1()
  to service_role;

create or replace function public.get_papoai_channel_capability_matrix_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_adapter_id uuid;
  v_result jsonb;
begin
  select id into v_adapter_id
  from public.channel_provider_adapters
  where provider_key='papoai' and channel='whatsapp'
  order by updated_at desc limit 1;

  if v_adapter_id is null then
    return jsonb_build_object('ok',false,'reason','adapter_not_found');
  end if;

  with canonical(capability,provider_key,fallback) as (
    values
      ('text','agent_external.text_reply','none'),
      ('image','agent_external.outbound_image','text'),
      ('voice','agent_external.outbound_voice','text'),
      ('buttons','agent_external.button_reply','numbered_text'),
      ('list','agent_external.list_reply','numbered_text'),
      ('flow','agent_external.flow_reply','progressive_chat'),
      ('handoff','agent_external.handoff','safe_text_and_manual_signal'),
      ('silent','agent_external.silent','handoff_or_no_message'),
      ('typing','agent_external.typing','no_op'),
      ('read_receipt','agent_external.read_receipt','no_op'),
      ('inbound_audio','agent_external.inbound_audio','text_only'),
      ('inbound_image','agent_external.inbound_image','text_only')
  ),
  joined as (
    select
      c.capability,
      c.provider_key,
      c.fallback,
      coalesce(e.state,'unknown') state,
      e.evidence_source,
      coalesce(e.evidence,'{}'::jsonb) evidence,
      e.verified_at,
      e.observed_at,
      coalesce(e.state in ('verified_lab','verified_production'),false) verified
    from canonical c
    left join public.channel_provider_capability_evidence e
      on e.adapter_id=v_adapter_id and e.capability_key=c.provider_key
  )
  select jsonb_build_object(
    'ok',true,
    'adapter_id',v_adapter_id,
    'capabilities',coalesce(jsonb_object_agg(
      capability,
      jsonb_build_object(
        'provider_key',provider_key,
        'state',state,
        'verified',verified,
        'fallback',fallback,
        'evidence_source',evidence_source,
        'observed_at',observed_at,
        'verified_at',verified_at,
        'evidence',evidence
      )
    ),'{}'::jsonb)
  )
  into v_result
  from joined;

  return v_result;
end;
$$;

revoke all on function public.get_papoai_channel_capability_matrix_v1()
  from public,anon,authenticated;
grant execute on function public.get_papoai_channel_capability_matrix_v1()
  to service_role;

create or replace function public.resolve_papoai_channel_delivery_v1(
  p_requested_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_requested text:=lower(trim(coalesce(p_requested_type,'text')));
  v_matrix jsonb:=public.get_papoai_channel_capability_matrix_v1();
  v_cfg public.papoai_channel_runtime_config%rowtype;
  v_capability text;
  v_state text:='unknown';
  v_verified boolean:=false;
  v_resolved text;
  v_fallback boolean:=false;
  v_reason text:='requested_supported';
begin
  select * into v_cfg from public.papoai_channel_runtime_config where id=1;

  v_capability:=case v_requested
    when 'text' then 'text'
    when 'image' then 'image'
    when 'image_caption' then 'image'
    when 'product' then 'image'
    when 'product_list' then 'image'
    when 'voice' then 'voice'
    when 'buttons' then 'buttons'
    when 'list' then 'list'
    when 'flow' then 'flow'
    when 'handoff' then 'handoff'
    when 'silent' then 'silent'
    when 'typing' then 'typing'
    when 'read_receipt' then 'read_receipt'
    else 'text'
  end;

  v_state:=coalesce(v_matrix#>>array['capabilities',v_capability,'state'],'unknown');
  v_verified:=coalesce((v_matrix#>>array['capabilities',v_capability,'verified'])::boolean,false);

  if v_requested in ('image','image_caption','product','product_list') then
    v_verified:=v_verified and coalesce(v_cfg.outbound_image_enabled,false);
  elsif v_requested='voice' then
    v_verified:=v_verified and coalesce(v_cfg.outbound_voice_enabled,false);
  elsif v_requested in ('buttons','list') then
    v_verified:=v_verified and coalesce(v_cfg.interactive_enabled,false);
  elsif v_requested='flow' then
    v_verified:=v_verified and coalesce(v_cfg.flow_enabled,false);
  elsif v_requested='typing' then
    v_verified:=v_verified and coalesce(v_cfg.typing_enabled,false);
  elsif v_requested='read_receipt' then
    v_verified:=v_verified and coalesce(v_cfg.read_receipt_enabled,false);
  elsif v_requested='text' then
    v_verified:=v_verified;
  end if;

  if v_requested='text' then
    v_resolved:='text';
  elsif v_verified then
    v_resolved:=v_requested;
  else
    v_fallback:=true;
    v_reason:='capability_unverified_or_disabled';
    v_resolved:=case v_requested
      when 'buttons' then 'numbered_text'
      when 'list' then 'numbered_text'
      when 'flow' then 'progressive_chat'
      when 'typing' then 'no_op'
      when 'read_receipt' then 'no_op'
      when 'silent' then 'silent'
      when 'handoff' then 'handoff_text_fallback'
      else 'text'
    end;
  end if;

  return jsonb_build_object(
    'ok',true,
    'requested_type',v_requested,
    'resolved_type',v_resolved,
    'capability',v_capability,
    'capability_state',v_state,
    'verified',v_verified,
    'fallback_used',v_fallback,
    'reason',v_reason,
    'payload',coalesce(p_payload,'{}'::jsonb)
  );
end;
$$;

revoke all on function public.resolve_papoai_channel_delivery_v1(text,jsonb)
  from public,anon,authenticated;
grant execute on function public.resolve_papoai_channel_delivery_v1(text,jsonb)
  to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'channel_adapter_version','v1',
  'channel_capability_matrix_version','v1',
  'multimodal_runtime_version','v1',
  'r4_programming_status','in_progress'
),
updated_at=now()
where id=1;

commit;

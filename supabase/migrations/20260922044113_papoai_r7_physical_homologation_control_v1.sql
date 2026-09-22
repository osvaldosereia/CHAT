
begin;

create table if not exists public.papoai_r7_homologation_runs (
  id uuid primary key default gen_random_uuid(),
  adapter_id uuid not null references public.channel_provider_adapters(id) on delete cascade,
  status text not null default 'prepared'
    check(status in ('prepared','active','awaiting_manual','passed','partial','failed','expired','closed')),
  test_phone_hash text,
  expires_at timestamptz,
  key_rotation_state text not null default 'staged'
    check(key_rotation_state in ('staged','legacy_key_observed','new_key_observed','finalized')),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.papoai_r7_homologation_runs enable row level security;
revoke all on table public.papoai_r7_homologation_runs from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_r7_homologation_runs to service_role;

create index if not exists papoai_r7_homologation_runs_adapter_created_idx
  on public.papoai_r7_homologation_runs(adapter_id,created_at desc);

create table if not exists public.papoai_r7_homologation_cases (
  id bigserial primary key,
  run_id uuid not null references public.papoai_r7_homologation_runs(id) on delete cascade,
  case_key text not null,
  capability_key text,
  required_core boolean not null default false,
  verification_mode text not null
    check(verification_mode in ('automatic','manual','manual_or_automatic','fallback_resolution')),
  status text not null default 'pending'
    check(status in ('pending','attempted','observed','verified','unsupported','manual_setup_required','failed','skipped')),
  evidence jsonb not null default '{}'::jsonb,
  attempted_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(run_id,case_key)
);

alter table public.papoai_r7_homologation_cases enable row level security;
revoke all on table public.papoai_r7_homologation_cases from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_r7_homologation_cases to service_role;
grant usage,select on sequence public.papoai_r7_homologation_cases_id_seq to service_role;

create index if not exists papoai_r7_homologation_cases_run_status_idx
  on public.papoai_r7_homologation_cases(run_id,status,required_core);

do $$
begin
  if not exists(
    select 1 from vault.decrypted_secrets
    where name='dona_antonia_papoai_agent_external_lab_key_v2'
  ) then
    perform vault.create_secret(
      'r7_'||encode(extensions.gen_random_bytes(32),'hex'),
      'dona_antonia_papoai_agent_external_lab_key_v2',
      'R7 staged PapoAI external agent lab key; dual-key rotation until physical verification'
    );
  end if;
end $$;

create or replace function public.get_papoai_agent_external_lab_keys_v2()
returns jsonb
language sql
stable
security definer
set search_path=public,vault,extensions,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'version',case
      when name='dona_antonia_papoai_agent_external_lab_key_v2' then 'v2'
      else 'v1'
    end,
    'key',decrypted_secret,
    'fingerprint',substr(encode(extensions.digest(decrypted_secret,'sha256'),'hex'),1,12)
  ) order by case when name like '%_v2' then 0 else 1 end),'[]'::jsonb)
  from vault.decrypted_secrets
  where name in (
    'dona_antonia_papoai_agent_external_lab_key_v1',
    'dona_antonia_papoai_agent_external_lab_key_v2'
  );
$$;
revoke all on function public.get_papoai_agent_external_lab_keys_v2()
  from public,anon,authenticated;
grant execute on function public.get_papoai_agent_external_lab_keys_v2()
  to service_role;

create or replace function public.get_papoai_r7_key_rotation_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,vault,extensions,pg_temp
as $$
declare
  v_keys jsonb:=public.get_papoai_agent_external_lab_keys_v2();
  v_run public.papoai_r7_homologation_runs%rowtype;
begin
  select * into v_run
  from public.papoai_r7_homologation_runs
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'ok',true,
    'staged_key_count',jsonb_array_length(v_keys),
    'fingerprints',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'version',x->>'version','fingerprint',x->>'fingerprint'
      )),'[]'::jsonb)
      from jsonb_array_elements(v_keys) x
    ),
    'latest_run_id',v_run.id,
    'rotation_state',coalesce(v_run.key_rotation_state,'staged'),
    'new_key_physically_observed',coalesce(v_run.key_rotation_state in ('new_key_observed','finalized'),false)
  );
end;
$$;
revoke all on function public.get_papoai_r7_key_rotation_status_v1()
  from public,anon,authenticated;
grant execute on function public.get_papoai_r7_key_rotation_status_v1()
  to service_role;

create or replace function public.normalize_papoai_br_phone_v1(p_phone text)
returns text
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  d text:=regexp_replace(coalesce(p_phone,''),'\D','','g');
begin
  if left(d,2)='00' then d:=substr(d,3); end if;
  if left(d,1)='0' and length(d) in (11,12) then d:=substr(d,2); end if;
  if length(d) in (10,11) then d:='55'||d; end if;
  if left(d,2)<>'55' or length(d) not in (12,13) then
    return null;
  end if;
  return '+'||d;
end;
$$;

create or replace function public.begin_papoai_r7_homologation_v1(
  p_test_phone text,
  p_ttl_minutes integer default 45
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_adapter uuid;
  v_phone text:=public.normalize_papoai_br_phone_v1(p_test_phone);
  v_hash text;
  v_run uuid;
  v_exp timestamptz;
  v_text_state text;
  v_session_state text;
  v_request_state text;
begin
  if v_phone is null then raise exception 'invalid_test_phone'; end if;
  p_ttl_minutes:=greatest(10,least(coalesce(p_ttl_minutes,45),120));
  v_hash:=encode(extensions.digest(v_phone,'sha256'),'hex');
  v_exp:=now()+make_interval(mins=>p_ttl_minutes);

  select id into v_adapter
  from public.channel_provider_adapters
  where provider_key='papoai' and channel='whatsapp'
    and status in ('temporary_active','active')
  order by updated_at desc limit 1;
  if v_adapter is null then raise exception 'papoai_adapter_not_found'; end if;

  update public.papoai_r7_homologation_runs
     set status='expired',completed_at=coalesce(completed_at,now()),updated_at=now()
   where status='active' and (expires_at is null or expires_at<=now());

  if exists(
    select 1 from public.papoai_r7_homologation_runs
    where status='active' and expires_at>now()
  ) then raise exception 'r7_homologation_already_active'; end if;

  insert into public.papoai_r7_homologation_runs(
    adapter_id,status,test_phone_hash,expires_at,key_rotation_state,started_at,metadata
  ) values(
    v_adapter,'active',v_hash,v_exp,'staged',now(),
    jsonb_build_object(
      'phone_mask','***'||right(v_phone,4),
      'ttl_minutes',p_ttl_minutes,
      'external_side_effect','homologation_only',
      'production_activation_authorized',false
    )
  ) returning id into v_run;

  select state into v_request_state
  from public.channel_provider_capability_evidence
  where adapter_id=v_adapter and capability_key='agent_external.request';

  select state into v_session_state
  from public.channel_provider_capability_evidence
  where adapter_id=v_adapter and capability_key='agent_external.session';

  select state into v_text_state
  from public.channel_provider_capability_evidence
  where adapter_id=v_adapter and capability_key='agent_external.text_reply';

  insert into public.papoai_r7_homologation_cases(
    run_id,case_key,capability_key,required_core,verification_mode,status,evidence,verified_at
  ) values
    (v_run,'request','agent_external.request',true,'automatic',
      case when v_request_state in ('verified_lab','verified_production') then 'verified' else 'pending' end,
      jsonb_build_object('carried_state',coalesce(v_request_state,'unknown')),
      case when v_request_state in ('verified_lab','verified_production') then now() else null end),
    (v_run,'session','agent_external.session',true,'automatic',
      case when v_session_state in ('verified_lab','verified_production') then 'verified' else 'pending' end,
      jsonb_build_object('carried_state',coalesce(v_session_state,'unknown')),
      case when v_session_state in ('verified_lab','verified_production') then now() else null end),
    (v_run,'text','agent_external.text_reply',true,'manual_or_automatic',
      case when v_text_state in ('verified_lab','verified_production') then 'verified' else 'pending' end,
      jsonb_build_object('carried_state',coalesce(v_text_state,'unknown')),
      case when v_text_state in ('verified_lab','verified_production') then now() else null end),
    (v_run,'outbound_image','agent_external.outbound_image',false,'manual','pending','{}',null),
    (v_run,'inbound_image','agent_external.inbound_image',false,'automatic','pending','{}',null),
    (v_run,'inbound_audio','agent_external.inbound_audio',false,'automatic','pending','{}',null),
    (v_run,'outbound_voice','agent_external.outbound_voice',false,'manual','pending','{}',null),
    (v_run,'handoff','agent_external.handoff',true,'manual_or_automatic','pending','{}',null),
    (v_run,'silent','agent_external.silent',true,'manual','pending','{}',null),
    (v_run,'buttons','agent_external.button_reply',false,'fallback_resolution','manual_setup_required',
      jsonb_build_object('reason','provider_shape_not_verified','fallback','numbered_text'),null),
    (v_run,'list','agent_external.list_reply',false,'fallback_resolution','manual_setup_required',
      jsonb_build_object('reason','provider_shape_not_verified','fallback','numbered_text'),null),
    (v_run,'flow','agent_external.flow_reply',false,'fallback_resolution','manual_setup_required',
      jsonb_build_object('reason','provider_shape_not_verified','fallback','progressive_chat'),null),
    (v_run,'typing','agent_external.typing',false,'fallback_resolution','manual_setup_required',
      jsonb_build_object('reason','provider_control_not_verified','fallback','no_op'),null),
    (v_run,'read_receipt','agent_external.read_receipt',false,'fallback_resolution','manual_setup_required',
      jsonb_build_object('reason','provider_control_not_verified','fallback','no_op'),null);

  update public.channel_provider_agent_labs
     set enabled=true,
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
           'mode','r7_homologation',
           'r7_run_id',v_run,
           'expires_at',v_exp,
           'allowed_test_phone_hashes',jsonb_build_array(v_hash),
           'key_rotation','dual_key_staged'
         ),
         updated_at=now()
   where adapter_id=v_adapter;

  return jsonb_build_object(
    'ok',true,
    'run_id',v_run,
    'expires_at',v_exp,
    'test_phone_mask','***'||right(v_phone,4),
    'commands',jsonb_build_array(
      'TESTE_R7_TEXTO_DONA_ANTONIA',
      'TESTE_R7_IMAGEM_DONA_ANTONIA',
      'TESTE_R7_AUDIO_SAIDA_DONA_ANTONIA',
      'TESTE_HANDOFF_DONA_ANTONIA',
      'TESTE_R7_SILENCIO_DONA_ANTONIA'
    ),
    'send_manually',jsonb_build_array(
      'uma foto de produto',
      'um áudio curto'
    ),
    'manual_provider_checks',jsonb_build_array(
      'reply buttons',
      'list',
      'Flow mínimo',
      'typing indicator',
      'read receipt'
    ),
    'production_activation_authorized',false
  );
end;
$$;
revoke all on function public.begin_papoai_r7_homologation_v1(text,integer)
  from public,anon,authenticated;
grant execute on function public.begin_papoai_r7_homologation_v1(text,integer)
  to service_role;

create or replace function public.record_papoai_r7_case_v1(
  p_run_id uuid,
  p_case_key text,
  p_status text,
  p_evidence jsonb default '{}'::jsonb,
  p_source text default 'r7_homologation'
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_case public.papoai_r7_homologation_cases%rowtype;
  v_run public.papoai_r7_homologation_runs%rowtype;
  v_cap_state text;
begin
  if p_status not in ('attempted','observed','verified','unsupported','manual_setup_required','failed','skipped') then
    raise exception 'invalid_r7_case_status';
  end if;

  select * into v_run
  from public.papoai_r7_homologation_runs
  where id=p_run_id
  for update;
  if not found then raise exception 'r7_run_not_found'; end if;

  select * into v_case
  from public.papoai_r7_homologation_cases
  where run_id=p_run_id and case_key=p_case_key
  for update;
  if not found then raise exception 'r7_case_not_found'; end if;

  update public.papoai_r7_homologation_cases
     set status=p_status,
         evidence=coalesce(evidence,'{}'::jsonb)||coalesce(p_evidence,'{}'::jsonb)
           ||jsonb_build_object('evidence_source',p_source),
         attempted_at=case when p_status in ('attempted','observed','verified','failed') then coalesce(attempted_at,now()) else attempted_at end,
         verified_at=case when p_status='verified' then now() else verified_at end,
         updated_at=now()
   where id=v_case.id
   returning * into v_case;

  if v_case.capability_key is not null and p_status in ('verified','unsupported','manual_setup_required','observed') then
    v_cap_state:=case p_status
      when 'verified' then 'verified_lab'
      when 'unsupported' then 'unsupported'
      when 'manual_setup_required' then 'manual_setup_required'
      when 'observed' then 'observed_payload'
    end;
    perform public.set_channel_provider_capability_state_v1(
      v_run.adapter_id,v_case.capability_key,v_cap_state,p_source,
      coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('r7_run_id',p_run_id)
    );
  end if;

  update public.papoai_r7_homologation_runs
     set status=case
       when status='active' and exists(
         select 1 from public.papoai_r7_homologation_cases
         where run_id=p_run_id and verification_mode='manual'
           and status in ('pending','attempted','observed')
       ) then 'awaiting_manual'
       else status
     end,
     updated_at=now()
   where id=p_run_id;

  return jsonb_build_object(
    'ok',true,'run_id',p_run_id,'case_key',p_case_key,'status',v_case.status,
    'capability_key',v_case.capability_key
  );
end;
$$;
revoke all on function public.record_papoai_r7_case_v1(uuid,text,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.record_papoai_r7_case_v1(uuid,text,text,jsonb,text)
  to service_role;

create or replace function public.mark_papoai_r7_key_observed_v1(
  p_run_id uuid,
  p_key_version text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if p_key_version not in ('v1','v2') then raise exception 'invalid_key_version'; end if;
  update public.papoai_r7_homologation_runs
     set key_rotation_state=case
       when p_key_version='v2' then 'new_key_observed'
       when key_rotation_state='staged' then 'legacy_key_observed'
       else key_rotation_state
     end,
     metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'last_key_version_observed',p_key_version,
       'last_key_observed_at',now()
     ),
     updated_at=now()
   where id=p_run_id;
  return jsonb_build_object('ok',true,'run_id',p_run_id,'key_version',p_key_version);
end;
$$;
revoke all on function public.mark_papoai_r7_key_observed_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.mark_papoai_r7_key_observed_v1(uuid,text)
  to service_role;

create or replace function public.finalize_papoai_r7_lab_key_rotation_v1(
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,vault,extensions,pg_temp
as $$
declare
  v_run public.papoai_r7_homologation_runs%rowtype;
  v_old_id uuid;
begin
  select * into v_run
  from public.papoai_r7_homologation_runs
  where id=p_run_id
  for update;
  if not found then raise exception 'r7_run_not_found'; end if;
  if v_run.key_rotation_state not in ('new_key_observed','finalized') then
    raise exception 'new_key_not_physically_observed';
  end if;

  select id into v_old_id
  from vault.secrets
  where name='dona_antonia_papoai_agent_external_lab_key_v1'
  order by created_at desc limit 1;

  if v_old_id is not null and v_run.key_rotation_state<>'finalized' then
    perform vault.update_secret(
      v_old_id,
      'retired_'||encode(extensions.gen_random_bytes(32),'hex'),
      'dona_antonia_papoai_agent_external_lab_key_v1',
      'Retired after R7 dual-key rotation'
    );
  end if;

  update public.papoai_r7_homologation_runs
     set key_rotation_state='finalized',
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
           'legacy_key_retired_at',now()
         ),
         updated_at=now()
   where id=p_run_id;

  return jsonb_build_object('ok',true,'run_id',p_run_id,'rotation_state','finalized');
end;
$$;
revoke all on function public.finalize_papoai_r7_lab_key_rotation_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.finalize_papoai_r7_lab_key_rotation_v1(uuid)
  to service_role;

create or replace function public.get_papoai_r7_homologation_status_v1(
  p_run_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_run public.papoai_r7_homologation_runs%rowtype;
  v_cases jsonb;
  v_core_total integer:=0;
  v_core_verified integer:=0;
  v_pending integer:=0;
  v_resolved integer:=0;
  v_total integer:=0;
begin
  if p_run_id is null then
    select * into v_run
    from public.papoai_r7_homologation_runs
    order by created_at desc limit 1;
  else
    select * into v_run
    from public.papoai_r7_homologation_runs where id=p_run_id;
  end if;
  if not found then return jsonb_build_object('ok',false,'reason','r7_run_not_found'); end if;

  select
    count(*)::integer,
    count(*) filter(where required_core)::integer,
    count(*) filter(where required_core and status='verified')::integer,
    count(*) filter(where status in ('pending','attempted','observed'))::integer,
    count(*) filter(where status in ('verified','unsupported','manual_setup_required','skipped'))::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'case_key',case_key,
      'capability_key',capability_key,
      'required_core',required_core,
      'verification_mode',verification_mode,
      'status',status,
      'evidence',evidence,
      'attempted_at',attempted_at,
      'verified_at',verified_at
    ) order by id),'[]'::jsonb)
  into v_total,v_core_total,v_core_verified,v_pending,v_resolved,v_cases
  from public.papoai_r7_homologation_cases
  where run_id=v_run.id;

  return jsonb_build_object(
    'ok',true,
    'run_id',v_run.id,
    'status',case when v_run.status='active' and v_run.expires_at<=now() then 'expired' else v_run.status end,
    'expires_at',v_run.expires_at,
    'key_rotation_state',v_run.key_rotation_state,
    'core_verified',v_core_verified,
    'core_total',v_core_total,
    'all_core_verified',v_core_verified=v_core_total and v_core_total>0,
    'resolved_cases',v_resolved,
    'total_cases',v_total,
    'pending_cases',v_pending,
    'cases',v_cases
  );
end;
$$;
revoke all on function public.get_papoai_r7_homologation_status_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.get_papoai_r7_homologation_status_v1(uuid)
  to service_role;

create or replace function public.finish_papoai_r7_homologation_v1(
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_status jsonb:=public.get_papoai_r7_homologation_status_v1(p_run_id);
  v_ready boolean;
  v_final text;
begin
  if coalesce((v_status->>'ok')::boolean,false) is not true then return v_status; end if;

  v_ready:=
    coalesce((v_status->>'all_core_verified')::boolean,false)
    and coalesce((v_status->>'pending_cases')::integer,999)=0;

  v_final:=case when v_ready then 'passed' else 'partial' end;

  update public.papoai_r7_homologation_runs
     set status=v_final,completed_at=now(),updated_at=now()
   where id=p_run_id;

  update public.channel_provider_agent_labs
     set enabled=false,
         metadata=coalesce(metadata,'{}'::jsonb)-'allowed_test_phone_hashes'
           ||jsonb_build_object('last_r7_run_id',p_run_id,'mode','off'),
         updated_at=now()
   where adapter_id=(select adapter_id from public.papoai_r7_homologation_runs where id=p_run_id);

  return public.get_papoai_r7_homologation_status_v1(p_run_id)
    ||jsonb_build_object('ready_for_r8',v_ready,'production_ready',false);
end;
$$;
revoke all on function public.finish_papoai_r7_homologation_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.finish_papoai_r7_homologation_v1(uuid)
  to service_role;

create or replace function public.get_papoai_r7_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_run public.papoai_r7_homologation_runs%rowtype;
  v_status jsonb;
  v_rotation jsonb:=public.get_papoai_r7_key_rotation_status_v1();
  v_matrix jsonb:=public.get_papoai_channel_capability_matrix_v1();
  v_r6 jsonb:=public.get_papoai_r6_readiness_v1();
  v_ready boolean:=false;
begin
  select * into v_run
  from public.papoai_r7_homologation_runs
  order by created_at desc limit 1;

  if v_run.id is not null then
    v_status:=public.get_papoai_r7_homologation_status_v1(v_run.id);
    v_ready:=
      coalesce((v_status->>'all_core_verified')::boolean,false)
      and coalesce((v_status->>'pending_cases')::integer,999)=0
      and coalesce(v_run.key_rotation_state='finalized',false)
      and coalesce((v_r6->>'ready_for_r7')::boolean,false);
  end if;

  return jsonb_build_object(
    'ok',true,
    'round','R7',
    'programming_complete',true,
    'physical_homologation_complete',v_ready,
    'ready_for_r8',v_ready,
    'production_ready',false,
    'latest_run',coalesce(v_status,jsonb_build_object('ok',false,'reason','not_started')),
    'key_rotation',v_rotation,
    'capability_matrix',v_matrix->'capabilities',
    'fallback_policy',jsonb_build_object(
      'buttons','numbered_text',
      'list','numbered_text',
      'flow','progressive_chat',
      'typing','no_op',
      'read_receipt','no_op',
      'voice','text',
      'image','text'
    ),
    'next_required_action',case
      when v_run.id is null then 'start_physical_homologation_with_test_phone'
      when v_run.key_rotation_state not in ('new_key_observed','finalized') then 'update_papoai_external_agent_to_staged_v2_key_and_send_test'
      when not coalesce((v_status->>'all_core_verified')::boolean,false) then 'complete_core_physical_cases'
      when coalesce((v_status->>'pending_cases')::integer,0)>0 then 'resolve_remaining_physical_cases'
      when v_run.key_rotation_state<>'finalized' then 'finalize_key_rotation'
      else 'r8_canary'
    end
  );
end;
$$;
revoke all on function public.get_papoai_r7_readiness_v1()
  from public,anon,authenticated;
grant execute on function public.get_papoai_r7_readiness_v1()
  to service_role;

update public.papoai_channel_runtime_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'r7_programming_status','in_progress',
  'r7_homologation_mode','phone_hash_allowlist_plus_expiry',
  'r7_key_rotation','dual_key_staged',
  'r7_capability_promotion','evidence_required',
  'production_activation_authorized',false
),updated_at=now()
where id=1;

commit;

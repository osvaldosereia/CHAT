-- R7 programming checkpoint. Physical PapoAI/WhatsApp confirmation is intentionally not faked.

begin;

do $$
declare
  x jsonb;
  s jsonb;
  run_id uuid;
  keys jsonb;
begin
  keys:=public.get_papoai_agent_external_lab_keys_v2();
  if jsonb_array_length(keys)<2 then
    raise exception 'dual_key_rotation_not_staged';
  end if;
  if (keys->0->>'fingerprint')=(keys->1->>'fingerprint') then
    raise exception 'r7_keys_must_differ';
  end if;

  x:=public.begin_papoai_r7_homologation_v1('+5511999999999',15);
  if coalesce((x->>'ok')::boolean,false) is not true then
    raise exception 'r7_begin_failed:%',x;
  end if;
  run_id:=(x->>'run_id')::uuid;

  s:=public.get_papoai_r7_homologation_status_v1(run_id);
  if coalesce((s->>'core_total')::integer,0)<>5 then
    raise exception 'r7_core_total_invalid:%',s;
  end if;
  if coalesce((s->>'core_verified')::integer,0)<3 then
    raise exception 'r7_existing_verified_capabilities_not_carried:%',s;
  end if;

  if not exists(
    select 1 from jsonb_array_elements(s->'cases') c
    where c->>'case_key'='buttons'
      and c->>'status'='manual_setup_required'
  ) then raise exception 'buttons_fallback_resolution_missing'; end if;

  perform public.record_papoai_r7_case_v1(
    run_id,'outbound_image','observed',
    jsonb_build_object('rollback_test',true),'r7_sql_test'
  );

  s:=public.get_papoai_r7_homologation_status_v1(run_id);
  if not exists(
    select 1 from jsonb_array_elements(s->'cases') c
    where c->>'case_key'='outbound_image'
      and c->>'status'='observed'
  ) then raise exception 'r7_case_evidence_not_recorded'; end if;
end $$;

rollback;

do $$
declare
  r jsonb:=public.get_papoai_r7_readiness_v1();
  adapter_id uuid;
  lab jsonb;
begin
  if coalesce((r->>'programming_complete')::boolean,false) is not true then
    raise exception 'r7_programming_not_complete:%',r;
  end if;
  if coalesce((r->>'physical_homologation_complete')::boolean,true) is true then
    raise exception 'physical_homologation_must_not_be_faked:%',r;
  end if;
  if coalesce((r->>'ready_for_r8')::boolean,true) is true then
    raise exception 'r8_must_wait_for_physical_r7:%',r;
  end if;

  select id into adapter_id
  from public.channel_provider_adapters
  where provider_key='papoai' and channel='whatsapp'
  order by updated_at desc limit 1;
  lab:=public.get_papoai_agent_external_lab_config_v1(adapter_id);
  if coalesce((lab->>'enabled')::boolean,true) is true then
    raise exception 'lab_must_remain_off_until_test_phone_is_authorized';
  end if;

  if (select enabled from public.papoai_channel_runtime_config where id=1) then
    raise exception 'channel_runtime_must_remain_off';
  end if;
  if (select enabled from public.papoai_ai_runtime_config where id=1) then
    raise exception 'ai_runtime_must_remain_off';
  end if;
  if (select enabled from public.papoai_commerce_brain_config where id=1) then
    raise exception 'commerce_brain_must_remain_off';
  end if;
  if (select write_enabled from public.papoai_commerce_brain_config where id=1) then
    raise exception 'commerce_write_must_remain_off';
  end if;
end $$;

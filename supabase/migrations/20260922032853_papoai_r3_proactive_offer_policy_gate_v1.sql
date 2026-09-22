
begin;

create or replace function public.get_papoai_commerce_proactive_offer_v2(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_signal jsonb;
  v_policy_enabled boolean:=false;
begin
  select enabled into v_policy_enabled
  from public.papoai_commercial_policy_config
  where id=1;

  if not coalesce(v_policy_enabled,false) then
    return jsonb_build_object(
      'eligible',false,
      'reason','commercial_policy_disabled',
      'commercial_opportunity','none'
    );
  end if;

  v_signal:=public.get_papoai_commercial_opportunity_v1(p_conversation_id);
  if coalesce(v_signal->>'level','none')<>'strong' then
    return jsonb_build_object(
      'eligible',false,
      'reason',coalesce(v_signal->>'reason','not_strong'),
      'commercial_opportunity',coalesce(v_signal->>'level','none'),
      'candidate',v_signal->'candidate'
    );
  end if;

  return jsonb_build_object(
    'eligible',true,
    'reason',v_signal->>'reason',
    'commercial_opportunity','strong',
    'offer',v_signal->'candidate',
    'writes_performed',false
  );
end;
$$;

revoke all on function public.get_papoai_commerce_proactive_offer_v2(uuid)
  from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_proactive_offer_v2(uuid)
  to service_role;

commit;

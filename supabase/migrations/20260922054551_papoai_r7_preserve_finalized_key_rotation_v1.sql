
begin;

create or replace function public.mark_papoai_r7_key_observed_v1(
  p_run_id uuid,
  p_key_version text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_current text;
begin
  if p_key_version not in ('v1','v2') then raise exception 'invalid_key_version'; end if;

  select key_rotation_state into v_current
  from public.papoai_r7_homologation_runs
  where id=p_run_id
  for update;

  if not found then raise exception 'r7_run_not_found'; end if;

  update public.papoai_r7_homologation_runs
     set key_rotation_state=case
       when v_current='finalized' then 'finalized'
       when p_key_version='v2' then 'new_key_observed'
       when v_current='staged' then 'legacy_key_observed'
       else v_current
     end,
     metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'last_key_version_observed',p_key_version,
       'last_key_observed_at',now()
     ),
     updated_at=now()
   where id=p_run_id;

  return jsonb_build_object(
    'ok',true,
    'run_id',p_run_id,
    'key_version',p_key_version,
    'rotation_state',case
      when v_current='finalized' then 'finalized'
      when p_key_version='v2' then 'new_key_observed'
      when v_current='staged' then 'legacy_key_observed'
      else v_current
    end
  );
end;
$$;

revoke all on function public.mark_papoai_r7_key_observed_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.mark_papoai_r7_key_observed_v1(uuid,text)
  to service_role;

update public.papoai_r7_homologation_runs
set key_rotation_state='finalized',
    updated_at=now()
where id='44d24129-b4a0-40b9-8b2d-2ed196614dbe'::uuid
  and metadata ? 'legacy_key_retired_at';

commit;

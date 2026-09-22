
begin;

do $$
declare
  ddl text;
begin
  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='execute_papoai_ai_tool_v1';

  ddl:=replace(
    ddl,
    'v_digest:=encode(digest(v_args::text,''sha256''),''hex'');',
    'v_digest:=md5(v_args::text);'
  );

  execute ddl;
end $$;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'ai_round2_status','complete',
  'ai_round2_completed_at',now()
),
updated_at=now()
where id=1;

commit;

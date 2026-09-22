alter table public.papoai_commerce_brain_config
  drop constraint if exists papoai_commerce_brain_config_max_product_results_check;

alter table public.papoai_commerce_brain_config
  add constraint papoai_commerce_brain_config_max_product_results_check
  check (max_product_results between 1 and 20);

update public.papoai_commerce_brain_config
set max_product_results=20, updated_at=now()
where id=1;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='search_papoai_commerce_products_v1'
  limit 1;

  v_def:=replace(
    v_def,
    'v_limit:=greatest(1,least(coalesce(p_limit,v_cfg.max_product_results,6),12));',
    'v_limit:=greatest(1,least(coalesce(p_limit,v_cfg.max_product_results,6),20));'
  );
  v_def:=replace(
    v_def,
    'v_query_norm:=trim(v_query_norm);',
    E'v_query_norm:=trim(v_query_norm);\n\n  -- Sinônimos comuns observados no atendimento.\n  v_query_norm:=regexp_replace(v_query_norm,''\\\\mmiojos?\\\\M'',''lamen'',''g'');'
  );
  execute v_def;
end $$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='search_papoai_commerce_products_for_customer_v1'
  limit 1;

  v_def:=replace(
    v_def,
    'v_limit integer:=greatest(1,least(coalesce(p_limit,10),12));',
    'v_limit integer:=greatest(1,least(coalesce(p_limit,10),20));'
  );
  v_def:=replace(
    v_def,
    'v_search:=public.search_papoai_commerce_products_v1(p_query,12);',
    'v_search:=public.search_papoai_commerce_products_v1(p_query,20);'
  );
  execute v_def;
end $$;

create or replace function public.propose_papoai_commerce_product_choice_v1(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_search jsonb;
  v_items jsonb;
  v_action_id uuid;
  v_limit integer:=greatest(1,least(coalesce(p_limit,3),20));
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then
    raise exception 'papoai_commerce_brain_disabled';
  end if;

  v_search:=public.search_papoai_commerce_products_for_customer_v1(
    p_conversation_id,p_query,v_limit
  );
  v_items:=coalesce(v_search->'items','[]'::jsonb);

  if jsonb_array_length(v_items)=0 then
    return jsonb_build_object(
      'ok',false,'reason','product_not_found','query',p_query,
      'candidates','[]'::jsonb,
      'personalized',coalesce((v_search->>'personalized')::boolean,false),
      'writes_performed',false
    );
  end if;

  update public.papoai_commerce_pending_actions
     set status='cancelled',
         resolved_at=now(),
         updated_at=now(),
         payload=payload||jsonb_build_object('cancel_reason','new_product_search')
   where conversation_id=p_conversation_id
     and action_type='product_choice'
     and status='pending';

  insert into public.papoai_commerce_pending_actions(
    conversation_id,action_type,status,payload,expires_at
  ) values(
    p_conversation_id,'product_choice','pending',
    jsonb_build_object(
      'query',p_query,
      'candidates',v_items,
      'personalized',coalesce((v_search->>'personalized')::boolean,false),
      'choice_kind','catalog_search',
      'state_only',true,
      'commercial_write',false
    ),
    now()+interval '15 minutes'
  )
  returning id into v_action_id;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'candidates',v_items,
    'count',jsonb_array_length(v_items),
    'pending_action_id',v_action_id,
    'selection_required',jsonb_array_length(v_items)>1,
    'single_candidate',jsonb_array_length(v_items)=1,
    'personalized',coalesce((v_search->>'personalized')::boolean,false),
    'customer_context',v_search->'customer_context',
    'writes_performed',false
  );
end;
$function$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='select_papoai_commerce_product_choice_v1'
  limit 1;

  v_def:=replace(v_def,'p_selection>10','p_selection>20');
  execute v_def;
end $$;

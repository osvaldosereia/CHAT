-- R3 complete smoke tests — commercial seller/governor

do $$
declare
  x jsonb;
  conv_id uuid;
  search_result jsonb;
begin
  x:=public.classify_papoai_commercial_opportunity_v1(
    false,false,false,false,0,1,false,true,false,80,20,6,false,50,15,5
  );
  if x->>'level'<>'none' then raise exception 'expected no-cart none: %',x; end if;

  x:=public.classify_papoai_commercial_opportunity_v1(
    true,false,false,false,0,1,false,true,false,20,5,1,false,50,15,5
  );
  if x->>'level'<>'weak' then raise exception 'expected weak signal: %',x; end if;

  x:=public.classify_papoai_commercial_opportunity_v1(
    true,false,false,false,0,1,false,true,true,10,0,0,false,50,15,5
  );
  if x->>'level'<>'strong' then raise exception 'repeat buyer must be strong: %',x; end if;

  x:=public.resolve_papoai_governor_policy_v2('ASK',0,true,false);
  if x->>'action'<>'RECOMMEND' then raise exception 'delegation must prevent ASK: %',x; end if;

  x:=public.resolve_papoai_governor_policy_v2('ASK',2,false,false);
  if x->>'action'<>'RECOMMEND' then raise exception 'question cap must prevent third ASK: %',x; end if;

  select conversation_id into conv_id
  from public.messages
  where conversation_id is not null
  order by created_at desc
  limit 1;

  if conv_id is not null then
    search_result:=public.search_papoai_commerce_products_for_customer_v2(
      conv_id,'shampoo',8,20,'lowest_price'
    );

    if exists(
      select 1
      from jsonb_array_elements(coalesce(search_result->'items','[]'::jsonb)) p
      where coalesce((p->>'commercial_price')::numeric,999999)>20
    ) then
      raise exception 'budget search returned item above limit';
    end if;

    if not coalesce(
      (public.get_papoai_ai_context_pack_v2(conv_id,'teste')#>>'{context_budget,within_budget}')::boolean,
      false
    ) then
      raise exception 'R3 context pack exceeded budget';
    end if;
  end if;

  if (select enabled from public.papoai_ai_runtime_config where id=1) then
    raise exception 'AI runtime must remain off after R3';
  end if;

  if (select enabled from public.papoai_commercial_policy_config where id=1) then
    raise exception 'commercial policy must remain off after R3';
  end if;
end $$;

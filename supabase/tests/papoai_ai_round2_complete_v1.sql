-- R2 complete smoke tests — PapoAI Commerce OS
-- These tests must not activate production or perform commercial writes.

do $$
declare
  cfg jsonb;
  tool_total integer;
  tool_ready integer;
  tool_enabled integer;
  conv_id uuid;
  product_id uuid;
  preview jsonb;
  blocked jsonb;
  readiness jsonb;
begin
  cfg:=public.get_papoai_ai_runtime_config_v1();

  if coalesce((cfg->>'enabled')::boolean,false) then
    raise exception 'R2 gate failure: AI runtime must remain disabled';
  end if;

  if coalesce(cfg->>'execution_mode','')<>'off' then
    raise exception 'R2 gate failure: execution_mode must remain off';
  end if;

  select count(*),
         count(*) filter(where implementation_status='ready'),
         count(*) filter(where runtime_enabled)
  into tool_total,tool_ready,tool_enabled
  from public.papoai_ai_tool_registry;

  if tool_total<>21 or tool_ready<>21 or tool_enabled<>0 then
    raise exception 'R2 tool registry mismatch total=% ready=% enabled=%',
      tool_total,tool_ready,tool_enabled;
  end if;

  readiness:=public.get_papoai_commerce_readiness_v1();
  if coalesce((readiness->>'sellable_products')::integer,0)<1400 then
    raise exception 'R2 catalog scope unexpectedly small: %',readiness->>'sellable_products';
  end if;

  select id into product_id
  from public.products
  where is_active=true
    and physically_verified=true
    and coalesce(stock,0)>0
    and coalesce(price,0)>0
    and is_whatsapp_active=false
  order by name
  limit 1;

  if product_id is null then
    raise exception 'R2 test fixture missing legacy-flag-false sellable product';
  end if;

  if not coalesce((public.get_papoai_commerce_product_v1(product_id)->>'found')::boolean,false) then
    raise exception 'R2 product tool cannot retrieve sellable product outside legacy WhatsApp flag';
  end if;

  select conversation_id into conv_id
  from public.messages
  where conversation_id is not null
  order by created_at desc
  limit 1;

  if conv_id is not null then
    if not coalesce(
      (public.get_papoai_ai_context_pack_v1(conv_id,'teste')#>>'{context_budget,within_budget}')::boolean,
      false
    ) then
      raise exception 'R2 context pack exceeded budget';
    end if;

    preview:=public.execute_papoai_ai_tool_v1(
      conv_id,'get_product',jsonb_build_object('product_id',product_id),false,null
    );
    if coalesce(preview->>'reason','')<>'preview_only'
       or coalesce((preview->>'executed')::boolean,true) then
      raise exception 'R2 tool preview behavior invalid: %',preview;
    end if;

    blocked:=public.execute_papoai_ai_tool_v1(
      conv_id,'get_product',jsonb_build_object('product_id',product_id),true,null
    );
    if coalesce(blocked->>'reason','')<>'ai_runtime_not_active'
       or coalesce((blocked->>'executed')::boolean,true) then
      raise exception 'R2 execution gate behavior invalid: %',blocked;
    end if;
  end if;
end $$;

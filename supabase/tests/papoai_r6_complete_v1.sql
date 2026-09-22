-- R6 database journey regression.
-- Runs entirely inside a transaction and rolls back all test data.

begin;

update public.papoai_commerce_brain_config
set enabled=true,write_enabled=true,bling_queue_enabled=false
where id=1;

do $$
declare
  v_conv uuid:=gen_random_uuid();
  v_conv2 uuid:=gen_random_uuid();
  v_wa uuid;
  v_started jsonb;
  v_cart jsonb;
  v_cart_id uuid;
  v_initial_total numeric;
  v_after_remove numeric;
  v_after_add numeric;
  v_remove_product uuid;
  v_add_product uuid;
  v_arroz_name text;
  v_result jsonb;
  v_order_id uuid;
  v_customer uuid;
  v_count integer;
begin
  select id into v_wa from public.whatsapp_accounts
  where is_active=true order by updated_at desc limit 1;
  if v_wa is null then raise exception 'no_active_whatsapp_account'; end if;

  v_result:=public.search_papoai_commerce_products_v1('shampoo cabelo crespo',5);
  if jsonb_array_length(coalesce(v_result->'items','[]'::jsonb))=0 then
    raise exception 'semantic_search_empty';
  end if;

  v_result:=public.search_papoai_commerce_products_v1('óleo de soja',5);
  if exists(
    select 1 from jsonb_array_elements(coalesce(v_result->'items','[]'::jsonb)) x
    where lower(coalesce(x->>'name','')) not like '%óleo%soja%'
  ) then raise exception 'oil_search_false_positive'; end if;

  v_result:=public.search_papoai_commerce_products_v1('ração para cachorro',5);
  if exists(
    select 1 from jsonb_array_elements(coalesce(v_result->'items','[]'::jsonb)) x
    where upper(coalesce(x->>'category',''))<>'PETS'
  ) then raise exception 'dog_food_false_positive'; end if;

  insert into public.conversations(
    id,whatsapp_account_id,wa_contact_e164,source,status,stage,response_preference,mode,channel
  ) values(v_conv,v_wa,'+5565999990199','organic','open','new','auto','ai','whatsapp');

  v_result:=public.search_papoai_commerce_products_for_customer_v2(
    v_conv,'shampoo cachos',8,20,'lowest_price'
  );
  if exists(
    select 1 from jsonb_array_elements(coalesce(v_result->'items','[]'::jsonb)) x
    where coalesce((x->>'commercial_price')::numeric,999999)>20
  ) then raise exception 'budget_ceiling_failed'; end if;

  v_started:=public.start_papoai_commerce_basket_v1(v_conv,'Economica Bonini');
  if coalesce((v_started->>'ok')::boolean,false) is not true then
    raise exception 'basket_start_failed';
  end if;
  v_cart:=v_started->'cart';
  v_cart_id:=(v_cart->>'cart_id')::uuid;
  v_initial_total:=(v_cart->>'total')::numeric;

  select ci.product_id into v_remove_product
  from public.cart_items ci
  join public.basket_template_items bi
    on bi.id=nullif(ci.metadata->>'basket_template_item_id','')::uuid
  where ci.cart_id=v_cart_id and ci.source='basket' and ci.quantity>0 and bi.removable=true
  order by ci.created_at limit 1;
  if v_remove_product is null then raise exception 'no_removable_basket_item'; end if;

  v_cart:=public.set_papoai_commerce_basket_quantity_v1(v_conv,v_remove_product,0);
  v_after_remove:=(v_cart->>'total')::numeric;
  if v_after_remove>=v_initial_total then raise exception 'remove_did_not_reduce_total'; end if;

  select p.id into v_add_product
  from public.products p
  where p.is_active=true and p.physically_verified=true
    and coalesce(p.stock,0)>0 and coalesce(p.price,0)>0
    and not exists(
      select 1 from public.cart_items ci
      where ci.cart_id=v_cart_id and ci.product_id=p.id and ci.quantity>0
    )
  order by p.price,p.name limit 1;

  v_cart:=public.set_papoai_commerce_addon_quantity_v1(v_conv,v_add_product,1);
  v_after_add:=(v_cart->>'total')::numeric;
  if v_after_add<=v_after_remove then raise exception 'addon_did_not_increase_total'; end if;

  select p.name into v_arroz_name
  from public.cart_items ci join public.products p on p.id=ci.product_id
  where ci.cart_id=v_cart_id and ci.quantity>0 and lower(p.name) like '%arroz%'
  order by ci.created_at limit 1;
  if v_arroz_name is not null then
    v_result:=public.recommend_papoai_commerce_value_replacement_v1(v_conv,v_arroz_name,3);
    if coalesce((v_result->>'ok')::boolean,false) is not true
       or coalesce((v_result->>'count')::integer,0)<1 then
      raise exception 'delegated_replacement_recommendation_failed';
    end if;
  end if;

  v_result:=public.get_papoai_commerce_offers_v1(v_conv,10);
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception 'explicit_offers_failed';
  end if;

  perform public.begin_papoai_checkout_v2(v_conv);
  v_result:=public.save_papoai_commerce_checkout_profile_pending_v2(
    v_conv,'Cliente R6','Rua Teste R6','100','','Centro','Cuiabá','78000000','Teste R6','pix'
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception 'checkout_profile_failed';
  end if;

  v_result:=public.prepare_papoai_commerce_order_confirmation_v2(v_conv,'pix');
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception 'prepare_confirmation_failed';
  end if;

  v_result:=public.confirm_papoai_commerce_pending_action_v2(v_conv,true);
  if coalesce((v_result->>'confirmed')::boolean,false) is not true then
    raise exception 'order_confirmation_failed';
  end if;
  v_order_id:=(v_result#>>'{result,order_id}')::uuid;

  if not exists(select 1 from public.papoai_order_snapshots where order_id=v_order_id) then
    raise exception 'order_snapshot_missing';
  end if;
  if exists(select 1 from public.order_sync_jobs where order_id=v_order_id) then
    raise exception 'bling_queued_while_gate_off';
  end if;

  select customer_id into v_customer from public.orders where id=v_order_id;
  insert into public.conversations(
    id,whatsapp_account_id,customer_id,wa_contact_e164,source,status,stage,response_preference,mode,channel
  ) values(v_conv2,v_wa,v_customer,'+5565999990199','organic','open','new','auto','ai','whatsapp');

  v_result:=public.preview_papoai_commerce_repeat_last_purchase_v1(v_conv2);
  if coalesce((v_result->>'available')::boolean,false) is not true then
    raise exception 'repeat_preview_failed';
  end if;
  v_result:=public.propose_papoai_commerce_repeat_last_purchase_v1(v_conv2);
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception 'repeat_proposal_failed';
  end if;

  perform public.queue_papoai_commerce_handoff_v1(
    v_conv2,'r6_handoff_test','R6 human precedence',2::smallint
  );
  if coalesce(
    (public.get_papoai_commerce_human_precedence_v1(v_conv2)->>'human_active')::boolean,
    false
  ) is not true then raise exception 'human_precedence_failed'; end if;
  if coalesce(
    (public.resume_papoai_commerce_after_handoff_v1(v_conv2)->>'ok')::boolean,
    true
  ) is true then raise exception 'ai_resumed_with_open_handoff'; end if;

  perform public.confirm_papoai_commerce_pending_action_v2(v_conv,true);
  select count(*) into v_count from public.orders where conversation_id=v_conv;
  if v_count<>1 then raise exception 'duplicate_order_after_replay'; end if;
end $$;

rollback;

do $$
begin
  if (select enabled from public.papoai_commerce_brain_config where id=1) then
    raise exception 'commerce gate must remain off';
  end if;
  if (select write_enabled from public.papoai_commerce_brain_config where id=1) then
    raise exception 'write gate must remain off';
  end if;
  if (select enabled from public.papoai_ai_runtime_config where id=1) then
    raise exception 'AI runtime must remain off';
  end if;
  if (select count(*) from public.papoai_ai_tool_registry where runtime_enabled)>0 then
    raise exception 'runtime tools must remain off';
  end if;
end $$;

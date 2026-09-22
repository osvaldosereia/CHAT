-- R5 complete smoke test — checkout, immutable order, idempotency, handoff and Bling isolation.
-- Runs entirely inside a transaction and rolls back.

begin;

update public.papoai_commerce_brain_config
set enabled=true,write_enabled=true,bling_queue_enabled=false
where id=1;

do $$
declare
  v_conv uuid:=gen_random_uuid();
  v_conv2 uuid:=gen_random_uuid();
  v_cart uuid;
  v_cart2 uuid;
  v_product public.products%rowtype;
  v_step jsonb;
  v_confirm jsonb;
  v_confirm2 jsonb;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_customer_id uuid;
  v_handoff jsonb;
  v_resume jsonb;
  v_sum numeric;
begin
  select * into v_product
  from public.products
  where is_active=true and physically_verified=true
    and coalesce(stock,0)>0 and coalesce(price,0)>0
  order by name limit 1;

  insert into public.conversations(
    id,whatsapp_account_id,wa_contact_e164,source,status,stage,response_preference,mode,channel
  )
  select v_conv,id,'+5565999990001','organic','open','new','auto','ai','whatsapp'
  from public.whatsapp_accounts where is_active=true order by updated_at desc limit 1;

  insert into public.carts(conversation_id,status,pricing_status)
  values(v_conv,'draft','ready') returning id into v_cart;

  insert into public.cart_items(
    cart_id,product_id,source,quantity,unit_price,line_total,commercial_unit_price
  ) values(v_cart,v_product.id,'addon',1,v_product.price,v_product.price,v_product.price);

  perform public.recalculate_papoai_commerce_cart_v1(v_cart);

  v_step:=public.begin_papoai_checkout_v2(v_conv);
  if v_step->>'step'<>'collect_profile' or (v_step->>'question_count')::integer<>1 then
    raise exception 'R5 first checkout question invalid: %',v_step;
  end if;

  perform public.save_papoai_commerce_checkout_profile_pending_v2(
    v_conv,'Cliente Teste','Rua Teste','123','','Centro','Cuiabá','78000000',null,null
  );

  v_step:=public.begin_papoai_checkout_v2(v_conv);
  if v_step->>'step'<>'collect_payment' or (v_step->>'question_count')::integer<>2 then
    raise exception 'R5 second checkout question invalid: %',v_step;
  end if;

  perform public.set_papoai_checkout_payment_method_v1(v_conv,'pix');
  perform public.prepare_papoai_commerce_order_confirmation_v2(v_conv,'pix');

  v_confirm:=public.confirm_papoai_commerce_pending_action_v2(v_conv,true);
  if coalesce((v_confirm->>'confirmed')::boolean,false) is not true then
    raise exception 'R5 confirmation failed: %',v_confirm;
  end if;

  v_order_id:=(v_confirm#>>'{result,order_id}')::uuid;
  select * into v_order from public.orders where id=v_order_id;

  if v_order.source<>'papoai_external_agent' or v_order.status<>'confirmed' then
    raise exception 'R5 local order invalid';
  end if;

  if not exists(select 1 from public.papoai_order_snapshots where order_id=v_order_id) then
    raise exception 'R5 immutable snapshot missing';
  end if;

  select coalesce(sum(line_total),0) into v_sum
  from public.order_items where order_id=v_order_id;

  if abs(v_sum-v_order.fiscal_subtotal)>0.01 then
    raise exception 'R5 item snapshot mismatch';
  end if;

  if exists(select 1 from public.order_sync_jobs where order_id=v_order_id) then
    raise exception 'R5 Bling queued while gate off';
  end if;

  v_confirm2:=public.confirm_papoai_commerce_pending_action_v2(v_conv,true);
  if coalesce((v_confirm2->>'idempotent_replay')::boolean,false) is not true
     or (v_confirm2#>>'{result,order_id}')::uuid<>v_order_id then
    raise exception 'R5 idempotent replay failed: %',v_confirm2;
  end if;

  if (select count(*) from public.orders where conversation_id=v_conv)<>1 then
    raise exception 'R5 duplicate order created';
  end if;

  v_customer_id:=v_order.customer_id;

  insert into public.conversations(
    id,whatsapp_account_id,customer_id,wa_contact_e164,source,status,stage,
    response_preference,mode,channel
  )
  select v_conv2,id,v_customer_id,'+5565999990001','organic','open','new','auto','ai','whatsapp'
  from public.whatsapp_accounts where is_active=true order by updated_at desc limit 1;

  insert into public.carts(conversation_id,customer_id,status,pricing_status)
  values(v_conv2,v_customer_id,'draft','ready') returning id into v_cart2;
  insert into public.cart_items(
    cart_id,product_id,source,quantity,unit_price,line_total,commercial_unit_price
  ) values(v_cart2,v_product.id,'addon',1,v_product.price,v_product.price,v_product.price);
  perform public.recalculate_papoai_commerce_cart_v1(v_cart2);

  v_step:=public.begin_papoai_checkout_v2(v_conv2);
  if v_step->>'step'<>'confirm_saved_address' then
    raise exception 'R5 known-address confirmation missing: %',v_step;
  end if;

  perform public.confirm_papoai_checkout_saved_address_v1(v_conv2,true);
  v_step:=public.begin_papoai_checkout_v2(v_conv2);
  if v_step->>'step'<>'collect_payment' or (v_step->>'question_count')::integer<>2 then
    raise exception 'R5 known-customer checkout invalid: %',v_step;
  end if;

  v_handoff:=public.queue_papoai_commerce_handoff_v1(
    v_conv2,'test_handoff','Teste de precedência humana',2::smallint
  );
  if coalesce((public.get_papoai_commerce_human_precedence_v1(v_conv2)->>'human_active')::boolean,false) is not true then
    raise exception 'R5 human precedence failed';
  end if;

  v_resume:=public.resume_papoai_commerce_after_handoff_v1(v_conv2);
  if v_resume->>'reason'<>'open_handoff_exists' then
    raise exception 'R5 AI resumed while handoff open';
  end if;
end $$;

rollback;

select public.get_papoai_r5_readiness_v1();

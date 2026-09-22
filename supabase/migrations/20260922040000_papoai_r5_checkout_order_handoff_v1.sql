begin;

create table if not exists public.papoai_checkout_state (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  question_count smallint not null default 0 check(question_count between 0 and 2),
  saved_address_decision text
    check(saved_address_decision in ('pending','accepted','rejected','replaced','not_applicable')),
  last_prompt_key text,
  payment_method text,
  checkout_started_at timestamptz not null default now(),
  address_confirmed_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.papoai_checkout_state enable row level security;
revoke all on table public.papoai_checkout_state from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_checkout_state to service_role;

create table if not exists public.papoai_order_snapshots (
  order_id uuid primary key references public.orders(id) on delete cascade,
  pending_action_id uuid references public.papoai_commerce_pending_actions(id) on delete set null,
  snapshot_version smallint not null default 1,
  snapshot_hash text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists papoai_order_snapshots_hash_uq
  on public.papoai_order_snapshots(snapshot_hash);
create index if not exists papoai_order_snapshots_pending_action_id_idx
  on public.papoai_order_snapshots(pending_action_id)
  where pending_action_id is not null;

alter table public.papoai_order_snapshots enable row level security;
revoke all on table public.papoai_order_snapshots from public,anon,authenticated;
grant select,insert on table public.papoai_order_snapshots to service_role;

create index if not exists human_handoffs_customer_id_idx
  on public.human_handoffs(customer_id)
  where customer_id is not null;
create index if not exists human_handoffs_source_message_id_idx
  on public.human_handoffs(source_message_id)
  where source_message_id is not null;
create index if not exists human_handoffs_channel_account_id_idx
  on public.human_handoffs(channel_account_id)
  where channel_account_id is not null;


CREATE OR REPLACE FUNCTION public.begin_papoai_checkout_v2(p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_next jsonb;
  v_record jsonb;
  v_step text;
begin
  insert into public.papoai_checkout_state(conversation_id)
  values(p_conversation_id)
  on conflict(conversation_id) do nothing;

  v_next:=public.get_papoai_checkout_next_step_v1(p_conversation_id);
  v_step:=v_next->>'step';

  if v_step in ('confirm_saved_address','collect_profile','collect_payment') then
    v_record:=public.record_papoai_checkout_prompt_v1(
      p_conversation_id,v_next->>'prompt_key'
    );

    if not coalesce((v_record->>'ok')::boolean,false) then
      return jsonb_build_object(
        'step','needs_human','ready',false,
        'reason','checkout_question_limit',
        'question_count',v_record->'question_count'
      );
    end if;

    update public.whatsapp_sales_state
       set awaiting=case v_step
         when 'confirm_saved_address' then 'checkout_address_confirmation'
         when 'collect_profile' then 'checkout_profile'
         when 'collect_payment' then 'payment_method'
       end,
       last_action='checkout_prompt:'||v_step,
       updated_at=now()
     where conversation_id=p_conversation_id;

    if not found then
      insert into public.whatsapp_sales_state(conversation_id,awaiting,last_action)
      values(
        p_conversation_id,
        case v_step
          when 'confirm_saved_address' then 'checkout_address_confirmation'
          when 'collect_profile' then 'checkout_profile'
          when 'collect_payment' then 'payment_method'
        end,
        'checkout_prompt:'||v_step
      );
    end if;

    v_next:=v_next||jsonb_build_object(
      'question_count',v_record->'question_count'
    );
  end if;

  return v_next;
end;
$function$
revoke all on function begin_papoai_checkout_v2(uuid) from public,anon,authenticated;
grant execute on function begin_papoai_checkout_v2(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.build_papoai_order_snapshot_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
  v_items jsonb:='[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id=p_order_id;

  if not found then
    return jsonb_build_object('ok',false,'reason','order_not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_item_id',oi.id,
    'product_id',oi.product_id,
    'sku',oi.sku_snapshot,
    'name',oi.name_snapshot,
    'quantity',oi.quantity,
    'unit_price',oi.unit_price,
    'line_total',oi.line_total,
    'source',oi.metadata->>'source',
    'commercial_delta',coalesce((oi.metadata->>'commercial_delta')::numeric,0)
  ) order by oi.created_at,oi.id),'[]'::jsonb)
  into v_items
  from public.order_items oi
  where oi.order_id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'schema_version','papoai-order-confirmed-v1',
    'order_id',v_order.id,
    'order_number',v_order.order_number,
    'source',v_order.source,
    'status',v_order.status,
    'customer_id',v_order.customer_id,
    'conversation_id',v_order.conversation_id,
    'cart_id',v_order.cart_id,
    'basket_id',v_order.basket_id,
    'basket_name',v_order.basket_name_snapshot,
    'items',v_items,
    'fiscal_subtotal',v_order.fiscal_subtotal,
    'other_expenses',v_order.other_expenses,
    'discount',v_order.discount,
    'basket_hidden_adjustment',v_order.basket_hidden_adjustment,
    'total',v_order.total,
    'payment_method',v_order.payment_method,
    'delivery_address',v_order.delivery_address,
    'customer_snapshot',v_order.customer_snapshot,
    'checkout_snapshot',v_order.checkout_snapshot,
    'confirmed_at',v_order.confirmed_at
  );
end;
$function$
revoke all on function build_papoai_order_snapshot_v1(uuid) from public,anon,authenticated;
grant execute on function build_papoai_order_snapshot_v1(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.confirm_papoai_checkout_saved_address_v1(p_conversation_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_profile jsonb;
begin
  insert into public.papoai_checkout_state(conversation_id)
  values(p_conversation_id)
  on conflict(conversation_id) do nothing;

  if coalesce(p_accept,false) then
    update public.papoai_checkout_state
       set saved_address_decision='accepted',
           address_confirmed_at=now(),
           updated_at=now()
     where conversation_id=p_conversation_id;

    update public.whatsapp_sales_state
       set awaiting='payment_method',
           last_action='saved_address_confirmed',
           updated_at=now()
     where conversation_id=p_conversation_id;
  else
    update public.papoai_checkout_state
       set saved_address_decision='rejected',
           address_confirmed_at=null,
           updated_at=now()
     where conversation_id=p_conversation_id;

    insert into public.whatsapp_sales_state(conversation_id,awaiting,last_action)
    values(p_conversation_id,'checkout_profile','saved_address_rejected')
    on conflict(conversation_id) do update set
      pending_delivery_address='{}'::jsonb,
      awaiting='checkout_profile',
      last_action='saved_address_rejected',
      updated_at=now();
  end if;

  v_profile:=public.get_papoai_commerce_checkout_profile_v2(p_conversation_id);

  return jsonb_build_object(
    'ok',true,
    'accepted',coalesce(p_accept,false),
    'profile',v_profile
  );
end;
$function$
revoke all on function confirm_papoai_checkout_saved_address_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function confirm_papoai_checkout_saved_address_v1(uuid,boolean) to service_role;

CREATE OR REPLACE FUNCTION public.confirm_papoai_commerce_pending_action_v2(p_conversation_id uuid, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_result jsonb;
  v_recent public.papoai_commerce_pending_actions%rowtype;
  v_order public.orders%rowtype;
  v_snapshot public.papoai_order_snapshots%rowtype;
begin
  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id
    and status='pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    if coalesce(p_confirm,false) then
      select * into v_recent
      from public.papoai_commerce_pending_actions
      where conversation_id=p_conversation_id
        and action_type='confirm_order'
        and status='confirmed'
        and resolved_at>=now()-interval '30 minutes'
        and nullif(payload->>'order_id','') is not null
      order by resolved_at desc
      limit 1;

      if found then
        select * into v_order
        from public.orders
        where id=(v_recent.payload->>'order_id')::uuid;

        select * into v_snapshot
        from public.papoai_order_snapshots
        where order_id=v_order.id;

        if v_order.id is not null then
          return jsonb_build_object(
            'ok',true,
            'confirmed',true,
            'action_type','confirm_order',
            'idempotent_replay',true,
            'result',jsonb_build_object(
              'ok',true,
              'order_id',v_order.id,
              'order_number',v_order.order_number,
              'status',v_order.status,
              'total',v_order.total,
              'payment_method',v_order.payment_method,
              'payment_label',public.whatsapp_basket_payment_label_v1(v_order.payment_method),
              'snapshot_hash',v_snapshot.snapshot_hash,
              'snapshot_immutable',v_snapshot.order_id is not null,
              'local_order_preserved',true
            )
          );
        end if;
      end if;
    end if;

    return jsonb_build_object('ok',false,'reason','no_pending_action');
  end if;

  if v_action.expires_at<=now() then
    update public.papoai_commerce_pending_actions
       set status='expired',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','pending_action_expired');
  end if;

  if not coalesce(p_confirm,false) then
    return public.confirm_papoai_commerce_pending_action_v1(
      p_conversation_id,false
    );
  end if;

  if v_action.action_type<>'confirm_order' then
    return public.confirm_papoai_commerce_pending_action_v1(
      p_conversation_id,true
    );
  end if;

  v_result:=public.finalize_papoai_commerce_order_v2(
    p_conversation_id,v_action.id
  );

  if not coalesce((v_result->>'ok')::boolean,false) then
    if v_result->>'reason'='cart_changed_reconfirm' then
      update public.papoai_commerce_pending_actions
         set status='failed',resolved_at=now(),updated_at=now()
       where id=v_action.id;
    end if;
    return v_result;
  end if;

  update public.papoai_commerce_pending_actions
     set status='confirmed',
         resolved_at=now(),
         updated_at=now(),
         payload=payload||jsonb_build_object(
           'order_id',v_result->>'order_id',
           'order_number',v_result->>'order_number',
           'snapshot_hash',v_result->>'snapshot_hash',
           'confirmed_at',now()
         )
   where id=v_action.id;

  return jsonb_build_object(
    'ok',true,
    'confirmed',true,
    'action_type','confirm_order',
    'idempotent_replay',false,
    'result',v_result
  );
end;
$function$
revoke all on function confirm_papoai_commerce_pending_action_v2(uuid,boolean) from public,anon,authenticated;
grant execute on function confirm_papoai_commerce_pending_action_v2(uuid,boolean) to service_role;

CREATE OR REPLACE FUNCTION public.execute_papoai_ai_tool_v1(p_conversation_id uuid, p_tool_key text, p_arguments jsonb DEFAULT '{}'::jsonb, p_execute boolean DEFAULT false, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_started timestamptz:=clock_timestamp();
  v_cfg public.papoai_ai_runtime_config%rowtype;
  v_commerce public.papoai_commerce_brain_config%rowtype;
  v_tool public.papoai_ai_tool_registry%rowtype;
  v_key text:=lower(trim(coalesce(p_tool_key,'')));
  v_args jsonb:=coalesce(p_arguments,'{}'::jsonb);
  v_allowed boolean:=false;
  v_reason text:='';
  v_result jsonb:='{}'::jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_item jsonb;
  v_source text;
  v_digest text;
begin
  select * into v_cfg from public.papoai_ai_runtime_config where id=1;
  select * into v_commerce from public.papoai_commerce_brain_config where id=1;
  select * into v_tool from public.papoai_ai_tool_registry where tool_key=v_key;

  if not found then
    return jsonb_build_object('ok',false,'allowed',false,'executed',false,'reason','unknown_tool','tool_key',v_key);
  end if;

  v_digest:=md5(v_args::text);

  if v_tool.implementation_status<>'ready' then
    v_reason:='tool_not_ready';
  elsif not p_execute then
    v_allowed:=true;
    v_reason:='preview_only';
  elsif not coalesce(v_cfg.enabled,false) or v_cfg.execution_mode<>'active' then
    v_reason:='ai_runtime_not_active';
  elsif not coalesce(v_tool.runtime_enabled,false) then
    v_reason:='tool_runtime_disabled';
  elsif v_tool.operation_kind='read' and not coalesce(v_cfg.allow_read_tool_execution,false) then
    v_reason:='read_tool_execution_disabled';
  elsif v_tool.operation_kind in ('write','commitment') and not coalesce(v_cfg.allow_write_tool_execution,false) then
    v_reason:='write_tool_execution_disabled';
  elsif v_tool.requires_write_gate and not coalesce(v_commerce.write_enabled,false) then
    v_reason:='commerce_write_gate_disabled';
  elsif v_tool.operation_kind in ('write','commitment') and not coalesce(v_commerce.enabled,false) then
    v_reason:='commerce_brain_disabled';
  elsif v_tool.requires_confirmation
        and v_key='confirm_order'
        and coalesce((v_args->>'confirm')::boolean,false) is not true then
    v_reason:='explicit_confirmation_required';
  else
    v_allowed:=true;
    v_reason:='allowed';
  end if;

  if not p_execute or not v_allowed then
    insert into public.papoai_ai_tool_audit(
      correlation_id,conversation_id,tool_key,operation_kind,execute_requested,
      allowed,executed,success,reason,arguments_digest,result_summary,latency_ms
    ) values(
      p_correlation_id,p_conversation_id,v_key,v_tool.operation_kind,p_execute,
      v_allowed,false,true,v_reason,v_digest,
      jsonb_build_object(
        'executor_kind',v_tool.executor_kind,
        'executor_target',v_tool.executor_target,
        'requires_write_gate',v_tool.requires_write_gate,
        'requires_confirmation',v_tool.requires_confirmation
      ),
      greatest(0,floor(extract(epoch from(clock_timestamp()-v_started))*1000))::integer
    );

    return jsonb_build_object(
      'ok',true,
      'allowed',v_allowed,
      'executed',false,
      'reason',v_reason,
      'tool_key',v_key,
      'operation_kind',v_tool.operation_kind,
      'executor_target',v_tool.executor_target
    );
  end if;

  case v_key
    when 'identify_customer' then
      v_result:=public.get_papoai_commerce_customer_snapshot_v2(p_conversation_id);

    when 'get_customer_context' then
      v_result:=public.get_papoai_commerce_customer_context_v3(p_conversation_id);

    when 'search_products' then
      v_result:=public.search_papoai_commerce_products_for_customer_v2(
        p_conversation_id,
        v_args->>'query',
        greatest(1,least(coalesce((v_args->>'limit')::integer,3),12)),
        case when nullif(v_args->>'max_price','') is null then null else (v_args->>'max_price')::numeric end,
        coalesce(nullif(v_args->>'preference',''),'best_match')
      );

    when 'get_product' then
      v_result:=public.get_papoai_commerce_product_v1((v_args->>'product_id')::uuid);

    when 'search_baskets' then
      v_result:=jsonb_build_object('ok',true,'items',public.get_papoai_commerce_basket_catalog_v1());

    when 'get_basket' then
      v_result:=public.get_papoai_commerce_basket_detail_v1(v_args->>'basket');

    when 'get_offers' then
      v_result:=public.get_papoai_commerce_offers_v1(
        p_conversation_id,
        greatest(1,least(coalesce((v_args->>'limit')::integer,4),10))
      );

    when 'get_cart' then
      v_result:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);

    when 'start_basket' then
      v_result:=public.start_papoai_commerce_basket_v1(p_conversation_id,v_args->>'basket');

    when 'add_cart_item' then
      v_product_id:=(v_args->>'product_id')::uuid;
      v_qty:=coalesce((v_args->>'quantity')::numeric,1);
      v_result:=public.set_papoai_commerce_addon_quantity_v1(p_conversation_id,v_product_id,v_qty);

    when 'remove_cart_item' then
      v_product_id:=(v_args->>'product_id')::uuid;
      select value into v_item
      from jsonb_array_elements(coalesce(public.get_papoai_commerce_cart_state_v1(p_conversation_id)->'items','[]'::jsonb))
      where value->>'product_id'=v_product_id::text
      limit 1;

      if v_item is null then
        raise exception 'cart_item_not_found';
      end if;

      v_source:=v_item->>'source';
      if v_source='basket' then
        v_result:=public.set_papoai_commerce_basket_quantity_v1(p_conversation_id,v_product_id,0);
      elsif v_source='addon' then
        v_result:=public.set_papoai_commerce_addon_quantity_v1(p_conversation_id,v_product_id,0);
      else
        raise exception 'unsupported_cart_item_source:%',v_source;
      end if;

    when 'change_quantity' then
      v_product_id:=(v_args->>'product_id')::uuid;
      v_qty:=(v_args->>'quantity')::numeric;
      select value into v_item
      from jsonb_array_elements(coalesce(public.get_papoai_commerce_cart_state_v1(p_conversation_id)->'items','[]'::jsonb))
      where value->>'product_id'=v_product_id::text
      limit 1;

      if v_item is null then
        raise exception 'cart_item_not_found';
      end if;

      v_source:=v_item->>'source';
      if v_source='basket' then
        v_result:=public.set_papoai_commerce_basket_quantity_v1(p_conversation_id,v_product_id,v_qty);
      elsif v_source='addon' then
        v_result:=public.set_papoai_commerce_addon_quantity_v1(p_conversation_id,v_product_id,v_qty);
      else
        raise exception 'unsupported_cart_item_source:%',v_source;
      end if;

    when 'replace_basket_item' then
      v_result:=public.replace_papoai_commerce_basket_item_v2(
        p_conversation_id,
        (v_args->>'source_product_id')::uuid,
        (v_args->>'replacement_product_id')::uuid,
        coalesce((v_args->>'customer_confirmed')::boolean,false)
      );

    when 'recommend_replacement' then
      v_result:=public.recommend_papoai_commerce_value_replacement_v1(
        p_conversation_id,
        v_args->>'source_query',
        greatest(1,least(coalesce((v_args->>'limit')::integer,3),3))
      );

    when 'repeat_last_purchase' then
      v_result:=public.propose_papoai_commerce_repeat_last_purchase_v1(p_conversation_id);

    when 'get_checkout_next_step' then
      v_result:=public.get_papoai_checkout_next_step_v1(p_conversation_id);

    when 'confirm_delivery_address' then
      v_result:=public.confirm_papoai_checkout_saved_address_v1(
        p_conversation_id,
        coalesce((v_args->>'accept')::boolean,false)
      );

    when 'set_payment_method' then
      v_result:=public.set_papoai_checkout_payment_method_v1(
        p_conversation_id,
        v_args->>'payment_method'
      );

    when 'update_checkout_profile' then
      v_result:=public.save_papoai_commerce_checkout_profile_pending_v2(
        p_conversation_id,
        coalesce(v_args->>'name',''),
        coalesce(v_args#>>'{address,street}',''),
        coalesce(v_args#>>'{address,number}',''),
        coalesce(v_args#>>'{address,complement}',''),
        coalesce(v_args#>>'{address,neighborhood}',''),
        coalesce(v_args#>>'{address,city}',''),
        nullif(v_args#>>'{address,postal_code}',''),
        nullif(v_args#>>'{address,reference}',''),
        nullif(v_args->>'payment_method','')
      );

    when 'preview_order' then
      v_result:=public.get_papoai_order_preview_v2(
        p_conversation_id,
        nullif(v_args->>'payment_method','')
      );

    when 'prepare_order_confirmation' then
      v_result:=public.prepare_papoai_commerce_order_confirmation_v2(
        p_conversation_id,
        v_args->>'payment_method'
      );

    when 'confirm_order' then
      v_result:=public.confirm_papoai_commerce_pending_action_v2(
        p_conversation_id,
        coalesce((v_args->>'confirm')::boolean,false)
      );

    when 'cancel_pending' then
      v_result:=public.cancel_papoai_commerce_pending_actions_v1(
        p_conversation_id,
        coalesce(nullif(trim(v_args->>'reason'),''),'customer_cancelled')
      );

    when 'request_handoff' then
      v_result:=public.queue_papoai_commerce_handoff_v1(
        p_conversation_id,
        coalesce(nullif(trim(v_args->>'reason'),''),'ai_requested_handoff'),
        nullif(trim(v_args->>'summary'),''),
        2
      );

    else
      raise exception 'tool_executor_not_implemented:%',v_key;
  end case;

  insert into public.papoai_ai_tool_audit(
    correlation_id,conversation_id,tool_key,operation_kind,execute_requested,
    allowed,executed,success,reason,arguments_digest,result_summary,latency_ms
  ) values(
    p_correlation_id,p_conversation_id,v_key,v_tool.operation_kind,true,
    true,true,true,'executed',v_digest,
    jsonb_build_object(
      'ok',coalesce((v_result->>'ok')::boolean,true),
      'found',v_result->>'found',
      'count',v_result->>'count',
      'ready',v_result->>'ready',
      'order_id',v_result->>'order_id',
      'has_cart',v_result->>'has_cart'
    ),
    greatest(0,floor(extract(epoch from(clock_timestamp()-v_started))*1000))::integer
  );

  return jsonb_build_object(
    'ok',true,
    'allowed',true,
    'executed',true,
    'tool_key',v_key,
    'result',v_result
  );

exception when others then
  begin
    insert into public.papoai_ai_tool_audit(
      correlation_id,conversation_id,tool_key,operation_kind,execute_requested,
      allowed,executed,success,reason,arguments_digest,result_summary,latency_ms
    ) values(
      p_correlation_id,p_conversation_id,coalesce(nullif(v_key,''),'unknown'),
      coalesce(v_tool.operation_kind,'unknown'),p_execute,
      v_allowed,false,false,'error',v_digest,
      jsonb_build_object('error',sqlerrm),
      greatest(0,floor(extract(epoch from(clock_timestamp()-v_started))*1000))::integer
    );
  exception when others then null;
  end;
  return jsonb_build_object(
    'ok',false,
    'allowed',v_allowed,
    'executed',false,
    'tool_key',v_key,
    'reason','execution_error',
    'error',sqlerrm
  );
end;
$function$
revoke all on function execute_papoai_ai_tool_v1(uuid,text,jsonb,boolean,uuid) from public,anon,authenticated;
grant execute on function execute_papoai_ai_tool_v1(uuid,text,jsonb,boolean,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.execute_papoai_commerce_command_v1(p_conversation_id uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_type text:=lower(trim(coalesce(p_command->>'type','')));
  v_result jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;

  case v_type
    when 'list_baskets' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=jsonb_build_object('ok',true,'baskets',public.get_papoai_commerce_basket_catalog_v1());

    when 'basket_detail' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=public.format_papoai_commerce_basket_message_v1(p_command->>'basket');

    when 'customer_context' then
      v_result:=public.get_papoai_commerce_customer_snapshot_v2(p_conversation_id);

    when 'repeat_preview' then
      v_result:=public.preview_papoai_commerce_repeat_last_purchase_v1(p_conversation_id);

    when 'repeat_last_purchase' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.propose_papoai_commerce_repeat_last_purchase_v1(p_conversation_id);

    when 'search_products' then
      v_result:=public.search_papoai_commerce_products_v1(
        p_command->>'query',nullif(p_command->>'limit','')::integer
      );

    when 'propose_product_choice' then
      v_result:=public.propose_papoai_commerce_product_choice_v1(
        p_conversation_id,p_command->>'query',coalesce(nullif(p_command->>'limit','')::integer,3)
      );

    when 'select_product_choice' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.select_papoai_commerce_product_choice_v1(
        p_conversation_id,
        (p_command->>'selection')::integer,
        coalesce(nullif(p_command->>'quantity','')::numeric,1)
      );

    when 'recommend_value_replacement' then
      v_result:=public.recommend_papoai_commerce_value_replacement_v1(
        p_conversation_id,p_command->>'source_query',coalesce(nullif(p_command->>'limit','')::integer,3)
      );

    when 'propose_value_replacement' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.propose_papoai_commerce_value_replacement_v1(
        p_conversation_id,p_command->>'source_query'
      );

    when 'select_value_replacement' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.select_papoai_commerce_value_replacement_v1(
        p_conversation_id,(p_command->>'selection')::integer
      );

    when 'offers' then
      v_result:=public.get_papoai_commerce_offers_v1(
        p_conversation_id,coalesce(nullif(p_command->>'limit','')::integer,4)
      );

    when 'cart_state' then
      v_result:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);

    when 'cart_summary' then
      v_result:=public.format_papoai_commerce_cart_summary_v1(p_conversation_id);

    when 'checkout_readiness' then
      v_result:=public.get_papoai_commerce_checkout_readiness_v1(p_conversation_id);

    when 'checkout_next_step' then
      v_result:=public.get_papoai_checkout_next_step_v1(p_conversation_id);

    when 'confirm_saved_address' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.confirm_papoai_checkout_saved_address_v1(
        p_conversation_id,coalesce((p_command->>'accept')::boolean,false)
      );

    when 'set_payment_method' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.set_papoai_checkout_payment_method_v1(
        p_conversation_id,p_command->>'payment_method'
      );

    when 'prepare_order_confirmation' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.prepare_papoai_commerce_order_confirmation_v2(
        p_conversation_id,p_command->>'payment_method'
      );

    when 'pending_action' then
      v_result:=public.get_papoai_commerce_pending_action_v1(p_conversation_id);

    when 'confirm_pending' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.confirm_papoai_commerce_pending_action_v2(
        p_conversation_id,coalesce((p_command->>'confirm')::boolean,true)
      );

    when 'start_basket' then
      v_result:=public.start_papoai_commerce_basket_v1(p_conversation_id,p_command->>'basket');

    when 'set_basket_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_basket_quantity_v1(
          p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric
        );
      else
        v_result:=public.set_papoai_commerce_basket_quantity_by_query_v1(
          p_conversation_id,p_command->>'source_query',(p_command->>'quantity')::numeric
        );
      end if;

    when 'set_addon_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_addon_quantity_v1(
          p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric
        );
      else
        v_result:=public.set_papoai_commerce_addon_by_query_v1(
          p_conversation_id,p_command->>'query',(p_command->>'quantity')::numeric
        );
      end if;

    when 'replacement_candidates' then
      v_result:=public.resolve_papoai_commerce_replacement_candidates_v1(
        p_conversation_id,p_command->>'source_query',p_command->>'replacement_query',
        coalesce(nullif(p_command->>'limit','')::integer,5)
      );

    when 'propose_replacement' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.propose_papoai_commerce_replacement_v1(
        p_conversation_id,p_command->>'source_query',p_command->>'replacement_query'
      );

    when 'replace_basket_item' then
      v_result:=public.replace_papoai_commerce_basket_item_v2(
        p_conversation_id,
        (p_command->>'source_product_id')::uuid,
        (p_command->>'replacement_product_id')::uuid,
        coalesce((p_command->>'customer_confirmed')::boolean,false)
      );

    when 'queue_bling' then
      v_result:=public.queue_papoai_commerce_bling_v1((p_command->>'order_id')::uuid);

    else
      raise exception 'unsupported_commerce_command:%',v_type;
  end case;

  insert into public.papoai_commerce_command_audit(
    conversation_id,command_type,command,outcome,result_summary
  ) values(
    p_conversation_id,v_type,coalesce(p_command,'{}'::jsonb),'ok',
    jsonb_build_object(
      'ok',coalesce((v_result->>'ok')::boolean,true),
      'available',v_result->>'available',
      'ready',v_result->>'ready',
      'found',v_result->>'found',
      'order_id',v_result->>'order_id',
      'needs_clarification',v_result->>'needs_clarification',
      'selected_product_id',v_result#>>'{selected,product_id}',
      'selected_option',v_result->>'selected_option'
    )
  );

  return v_result;
exception when others then
  begin
    insert into public.papoai_commerce_command_audit(
      conversation_id,command_type,command,outcome,result_summary
    ) values(
      p_conversation_id,coalesce(nullif(v_type,''),'unknown'),coalesce(p_command,'{}'::jsonb),'error',
      jsonb_build_object('error',sqlerrm)
    );
  exception when others then null;
  end;
  raise;
end;
$function$
revoke all on function execute_papoai_commerce_command_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function execute_papoai_commerce_command_v1(uuid,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.finalize_papoai_commerce_order_v2(p_conversation_id uuid, p_pending_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_cart_id uuid;
  v_result jsonb;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_prepared jsonb;
  v_prepared_hash text;
  v_final_snapshot jsonb;
  v_final_hash text;
  v_existing public.papoai_order_snapshots%rowtype;
  v_bling jsonb;
begin
  select * into v_cfg
  from public.papoai_commerce_brain_config
  where id=1;

  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;
  if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;

  select * into v_action
  from public.papoai_commerce_pending_actions
  where id=p_pending_action_id
    and conversation_id=p_conversation_id
    and action_type='confirm_order'
    and status='pending'
  for update;

  if not found then
    return jsonb_build_object('ok',false,'reason','pending_order_not_found');
  end if;

  v_prepared:=coalesce(v_action.payload->'prepared_snapshot','{}'::jsonb);
  v_prepared_hash:=nullif(v_action.payload->>'prepared_snapshot_hash','');

  if v_prepared_hash is null
     or v_prepared='{}'::jsonb
     or md5(v_prepared::text)<>v_prepared_hash then
    return jsonb_build_object('ok',false,'reason','prepared_snapshot_invalid');
  end if;

  v_cart_id:=nullif(v_action.payload->>'cart_id','')::uuid;

  v_result:=public.finalize_papoai_commerce_order_v1(
    p_conversation_id,p_pending_action_id
  );

  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  v_order_id:=(v_result->>'order_id')::uuid;

  select * into v_existing
  from public.papoai_order_snapshots
  where order_id=v_order_id;

  if not found then
    delete from public.order_items
    where order_id=v_order_id;

    insert into public.order_items(
      order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata
    )
    select
      v_order_id,
      ci.product_id,
      p.sku,
      p.name,
      ci.quantity,
      case
        when ci.source in ('addon','substitution')
          then coalesce(ci.commercial_unit_price,ci.unit_price,0)
        else coalesce(ci.unit_price,0)
      end,
      round(
        ci.quantity*case
          when ci.source in ('addon','substitution')
            then coalesce(ci.commercial_unit_price,ci.unit_price,0)
          else coalesce(ci.unit_price,0)
        end,2
      ),
      coalesce(ci.metadata,'{}'::jsonb)||jsonb_build_object(
        'source',ci.source,
        'commercial_delta',coalesce(ci.commercial_delta,0),
        'commercial_unit_price',ci.commercial_unit_price
      )
    from public.cart_items ci
    join public.products p on p.id=ci.product_id
    where ci.cart_id=v_cart_id and ci.quantity>0
    order by ci.created_at,ci.id;

    update public.orders
       set checkout_snapshot=coalesce(checkout_snapshot,'{}'::jsonb)||jsonb_build_object(
             'prepared_snapshot_hash',v_prepared_hash,
             'prepared_snapshot_schema',v_prepared->>'schema_version',
             'order_snapshot_version',1,
             'immutable_snapshot_created',true
           ),
           updated_at=now()
     where id=v_order_id;

    v_final_snapshot:=public.build_papoai_order_snapshot_v1(v_order_id);
    v_final_hash:=md5(v_final_snapshot::text);

    insert into public.papoai_order_snapshots(
      order_id,pending_action_id,snapshot_version,snapshot_hash,snapshot
    ) values(
      v_order_id,v_action.id,1,v_final_hash,v_final_snapshot
    )
    on conflict(order_id) do nothing;

    select * into v_existing
    from public.papoai_order_snapshots
    where order_id=v_order_id;

    if v_existing.snapshot_hash<>v_final_hash then
      raise exception 'immutable_order_snapshot_conflict';
    end if;
  end if;

  update public.papoai_checkout_state
     set completed_at=coalesce(completed_at,now()),
         updated_at=now()
   where conversation_id=p_conversation_id;

  update public.whatsapp_sales_state
     set awaiting=null,
         last_action='order_confirmed',
         updated_at=now()
   where conversation_id=p_conversation_id;

  if coalesce(v_cfg.bling_queue_enabled,false) then
    v_bling:=public.queue_papoai_commerce_bling_v1(v_order_id);
  else
    v_bling:=jsonb_build_object(
      'ok',true,
      'queued',false,
      'reason','papoai_bling_queue_disabled'
    );
  end if;

  select * into v_order from public.orders where id=v_order_id;

  return v_result||jsonb_build_object(
    'snapshot_hash',v_existing.snapshot_hash,
    'snapshot_version',v_existing.snapshot_version,
    'snapshot_immutable',true,
    'bling',v_bling,
    'local_order_preserved',true,
    'order_number',v_order.order_number
  );
end;
$function$
revoke all on function finalize_papoai_commerce_order_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function finalize_papoai_commerce_order_v2(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_papoai_ai_context_pack_v3(p_conversation_id uuid, p_current_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb:=public.get_papoai_ai_context_pack_v2(p_conversation_id,p_current_message);
  v_profile jsonb:=public.get_papoai_commerce_checkout_profile_v2(p_conversation_id);
  v_next jsonb:=public.get_papoai_checkout_next_step_v1(p_conversation_id);
begin
  if not coalesce((v_base->>'ok')::boolean,false) then
    return v_base;
  end if;

  return v_base||jsonb_build_object(
    'schema_version','papoai-ai-context-v3',
    'checkout',jsonb_build_object(
      'complete',coalesce((v_profile->>'complete')::boolean,false),
      'missing',coalesce(v_profile->'missing','[]'::jsonb),
      'known_customer',coalesce((v_profile->>'known_customer')::boolean,false),
      'requires_address_confirmation',coalesce((v_profile->>'requires_address_confirmation')::boolean,false),
      'address_source',v_profile->>'address_source',
      'delivery_city',v_profile#>>'{address,city}',
      'payment_method',v_profile->>'payment_method',
      'question_count',coalesce((v_profile->>'question_count')::integer,0),
      'full_address_included',false
    ),
    'checkout_flow',jsonb_build_object(
      'step',v_next->>'step',
      'ready',coalesce((v_next->>'ready')::boolean,false),
      'reason',v_next->>'reason',
      'question_count',coalesce((v_next->>'question_count')::integer,0)
    )
  );
end;
$function$
revoke all on function get_papoai_ai_context_pack_v3(uuid,text) from public,anon,authenticated;
grant execute on function get_papoai_ai_context_pack_v3(uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.get_papoai_checkout_next_step_v1(p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cart jsonb:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
  v_profile jsonb:=public.get_papoai_commerce_checkout_profile_v2(p_conversation_id);
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_state public.papoai_checkout_state%rowtype;
  v_q integer:=0;
  v_address text;
  v_payment text;
begin
  select * into v_state
  from public.papoai_checkout_state
  where conversation_id=p_conversation_id;
  v_q:=coalesce(v_state.question_count,0);
  v_payment:=coalesce(v_state.payment_method,v_profile->>'payment_method');

  if not coalesce((v_cart->>'has_cart')::boolean,false) then
    return jsonb_build_object('step','cart_missing','ready',false,'question_count',v_q);
  end if;

  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id
    and status='pending'
    and expires_at>now()
  order by created_at desc
  limit 1;

  if found and v_action.action_type='confirm_order' then
    return jsonb_build_object(
      'step','awaiting_final_confirmation','ready',true,
      'question_count',v_q,
      'pending_action',jsonb_build_object(
        'id',v_action.id,
        'action_type',v_action.action_type,
        'expires_at',v_action.expires_at,
        'payment_method',v_action.payload->>'payment_method',
        'payment_label',v_action.payload->>'payment_label',
        'prepared_total',v_action.payload->'prepared_total'
      )
    );
  end if;

  if coalesce((v_profile->>'requires_address_confirmation')::boolean,false) then
    if v_q>=2 then
      return jsonb_build_object(
        'step','needs_human','ready',false,
        'reason','checkout_question_limit','question_count',v_q
      );
    end if;
    v_address:=concat_ws(', ',
      nullif(v_profile#>>'{address,street}',''),
      case when nullif(v_profile#>>'{address,number}','') is not null
        then 'nº '||(v_profile#>>'{address,number}') else null end,
      nullif(v_profile#>>'{address,neighborhood}',''),
      nullif(v_profile#>>'{address,city}','')
    );
    return jsonb_build_object(
      'step','confirm_saved_address',
      'ready',false,
      'question_count',v_q,
      'prompt_key','confirm_saved_address',
      'prompt','Seu endereço de entrega continua sendo '||v_address||'?',
      'profile',v_profile
    );
  end if;

  if not coalesce((v_profile->>'complete')::boolean,false) then
    if v_q>=2 then
      return jsonb_build_object(
        'step','needs_human','ready',false,
        'reason','checkout_question_limit','question_count',v_q,
        'missing',v_profile->'missing'
      );
    end if;

    return jsonb_build_object(
      'step','collect_profile',
      'ready',false,
      'question_count',v_q,
      'prompt_key',case
        when coalesce(v_profile->>'saved_address_decision','')='rejected'
          then 'replacement_address_and_payment'
        else 'checkout_profile'
      end,
      'prompt',case
        when coalesce(v_profile->>'saved_address_decision','')='rejected'
          then 'Sem problema. Me mande em uma mensagem o novo endereço (rua, número, bairro e cidade) e como prefere pagar: Pix, dinheiro, cartão de crédito ou alimentação/refeição.'
        when v_profile->'missing' ? 'name'
          then 'Para finalizar, me mande em uma mensagem seu nome e endereço de entrega: rua, número, bairro e cidade.'
        else 'Para finalizar, me mande em uma mensagem o endereço de entrega: rua, número, bairro e cidade.'
      end,
      'profile',v_profile
    );
  end if;

  if nullif(v_payment,'') is null then
    if v_q>=2 then
      return jsonb_build_object(
        'step','needs_human','ready',false,
        'reason','checkout_question_limit','question_count',v_q,
        'missing',jsonb_build_array('payment_method')
      );
    end if;
    return jsonb_build_object(
      'step','collect_payment',
      'ready',false,
      'question_count',v_q,
      'prompt_key','payment_method',
      'prompt','Como você prefere pagar? Pode ser Pix, dinheiro, cartão de crédito ou cartão alimentação/refeição.',
      'profile',v_profile
    );
  end if;

  return jsonb_build_object(
    'step','ready_to_prepare_confirmation',
    'ready',true,
    'question_count',v_q,
    'payment_method',v_payment,
    'payment_label',public.whatsapp_basket_payment_label_v1(v_payment),
    'profile',v_profile
  );
end;
$function$
revoke all on function get_papoai_checkout_next_step_v1(uuid) from public,anon,authenticated;
grant execute on function get_papoai_checkout_next_step_v1(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_papoai_commerce_checkout_profile_v2(p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_contact jsonb:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  v_sales public.whatsapp_sales_state%rowtype;
  v_checkout public.papoai_checkout_state%rowtype;
  v_name text;
  v_contact_address jsonb:=coalesce(v_contact->'address','{}'::jsonb);
  v_pending_address jsonb:='{}'::jsonb;
  v_address jsonb:='{}'::jsonb;
  v_city text;
  v_missing text[]:='{}'::text[];
  v_known boolean:=coalesce((v_contact->>'known_customer')::boolean,false);
  v_source text:='none';
  v_requires_confirmation boolean:=false;
begin
  select * into v_sales
  from public.whatsapp_sales_state
  where conversation_id=p_conversation_id;

  select * into v_checkout
  from public.papoai_checkout_state
  where conversation_id=p_conversation_id;

  v_pending_address:=coalesce(v_sales.pending_delivery_address,'{}'::jsonb);

  v_name:=coalesce(
    nullif(trim(v_sales.pending_name),''),
    nullif(trim(v_contact->>'person_name'),''),
    nullif(trim(v_contact->>'name'),'')
  );

  if coalesce(v_checkout.saved_address_decision,'')='rejected' then
    v_address:=v_pending_address;
    v_source:=case when v_pending_address<>'{}'::jsonb then 'pending_replacement' else 'none' end;
  elsif v_pending_address<>'{}'::jsonb then
    v_address:=v_contact_address||v_pending_address;
    v_source:=case when v_contact_address<>'{}'::jsonb then 'merged' else 'pending' end;
  else
    v_address:=v_contact_address;
    v_source:=case when v_contact_address<>'{}'::jsonb then 'customer_saved' else 'none' end;
  end if;

  v_city:=public.normalize_local_delivery_city_v1(v_address->>'city');
  if v_city is not null then
    v_address:=v_address||jsonb_build_object('city',v_city,'state','MT');
  end if;

  if v_name is null then v_missing:=array_append(v_missing,'name'); end if;
  if nullif(trim(coalesce(v_address->>'street','')),'') is null then v_missing:=array_append(v_missing,'street'); end if;
  if nullif(trim(coalesce(v_address->>'number','')),'') is null then v_missing:=array_append(v_missing,'number'); end if;
  if nullif(trim(coalesce(v_address->>'neighborhood','')),'') is null then v_missing:=array_append(v_missing,'neighborhood'); end if;
  if v_city is null then v_missing:=array_append(v_missing,'city'); end if;

  v_requires_confirmation:=
    v_known
    and cardinality(v_missing)=0
    and v_source='customer_saved'
    and coalesce(v_checkout.saved_address_decision,'pending') not in ('accepted','replaced','not_applicable');

  return jsonb_build_object(
    'complete',cardinality(v_missing)=0,
    'missing',to_jsonb(v_missing),
    'name',v_name,
    'address',v_address,
    'address_source',v_source,
    'known_customer',v_known,
    'saved_address_decision',v_checkout.saved_address_decision,
    'requires_address_confirmation',v_requires_confirmation,
    'payment_method',coalesce(v_checkout.payment_method,v_sales.pending_payment_method),
    'question_count',coalesce(v_checkout.question_count,0),
    'writes_performed',false
  );
end;
$function$
revoke all on function get_papoai_commerce_checkout_profile_v2(uuid) from public,anon,authenticated;
grant execute on function get_papoai_commerce_checkout_profile_v2(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_papoai_order_preview_v2(p_conversation_id uuid, p_payment_method text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cart jsonb:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
  v_profile jsonb:=public.get_papoai_commerce_checkout_profile_v2(p_conversation_id);
  v_summary jsonb:=public.format_papoai_commerce_cart_summary_v1(p_conversation_id);
  v_method text;
begin
  v_method:=public.normalize_whatsapp_basket_payment_method_v1(
    coalesce(
      nullif(trim(p_payment_method),''),
      v_profile->>'payment_method'
    )
  );

  return jsonb_build_object(
    'ready',
      coalesce((v_cart->>'has_cart')::boolean,false)
      and coalesce((v_profile->>'complete')::boolean,false)
      and not coalesce((v_profile->>'requires_address_confirmation')::boolean,false)
      and v_method is not null
      and coalesce(v_cart->>'pricing_status','')='ready',
    'cart',v_cart,
    'profile',v_profile,
    'summary',v_summary,
    'payment_method',v_method,
    'payment_label',case when v_method is null then null else public.whatsapp_basket_payment_label_v1(v_method) end,
    'writes_performed',false
  );
end;
$function$
revoke all on function get_papoai_order_preview_v2(uuid,text) from public,anon,authenticated;
grant execute on function get_papoai_order_preview_v2(uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.get_papoai_order_snapshot_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select jsonb_build_object(
        'found',true,
        'order_id',s.order_id,
        'snapshot_version',s.snapshot_version,
        'snapshot_hash',s.snapshot_hash,
        'snapshot',s.snapshot,
        'created_at',s.created_at
      )
      from public.papoai_order_snapshots s
      where s.order_id=p_order_id
    ),
    jsonb_build_object('found',false,'order_id',p_order_id)
  );
$function$
revoke all on function get_papoai_order_snapshot_v1(uuid) from public,anon,authenticated;
grant execute on function get_papoai_order_snapshot_v1(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_papoai_r5_readiness_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_tool_total integer;
  v_tool_ready integer;
  v_tool_enabled integer;
begin
  select * into v_cfg
  from public.papoai_commerce_brain_config
  where id=1;

  select
    count(*)::integer,
    count(*) filter(where implementation_status='ready')::integer,
    count(*) filter(where runtime_enabled)::integer
  into v_tool_total,v_tool_ready,v_tool_enabled
  from public.papoai_ai_tool_registry;

  return jsonb_build_object(
    'ok',true,
    'round','R5',
    'programming_complete',
      coalesce(v_cfg.metadata->>'r5_programming_status','')='complete',
    'checkout_version',v_cfg.metadata->>'checkout_version',
    'checkout_context_version',v_cfg.metadata->>'checkout_context_version',
    'max_checkout_questions',
      coalesce((v_cfg.metadata->>'max_checkout_questions')::integer,2),
    'saved_address_confirmation_required',
      coalesce((v_cfg.metadata->>'saved_address_confirmation_required')::boolean,false),
    'order_snapshot_version',
      coalesce((v_cfg.metadata->>'order_snapshot_version')::integer,0),
    'order_snapshot_immutable',
      coalesce((v_cfg.metadata->>'order_snapshot_immutable')::boolean,false),
    'local_order_before_bling',
      coalesce((v_cfg.metadata->>'local_order_before_bling')::boolean,false),
    'bling_failure_preserves_local_order',
      coalesce((v_cfg.metadata->>'bling_failure_preserves_local_order')::boolean,false),
    'human_precedence_function',to_regprocedure('public.get_papoai_commerce_human_precedence_v1(uuid)') is not null,
    'resume_requires_closed_handoff',true,
    'tools',jsonb_build_object(
      'total',v_tool_total,
      'ready',v_tool_ready,
      'runtime_enabled',v_tool_enabled
    ),
    'gates',jsonb_build_object(
      'commerce_enabled',coalesce(v_cfg.enabled,false),
      'write_enabled',coalesce(v_cfg.write_enabled,false),
      'bling_queue_enabled',coalesce(v_cfg.bling_queue_enabled,false)
    ),
    'ready_for_r6',
      coalesce(v_cfg.metadata->>'r5_programming_status','')='complete'
      and coalesce((v_cfg.metadata->>'order_snapshot_immutable')::boolean,false)
      and coalesce((v_cfg.metadata->>'local_order_before_bling')::boolean,false)
      and v_tool_enabled=0,
    'production_ready',false
  );
end;
$function$
revoke all on function get_papoai_r5_readiness_v1() from public,anon,authenticated;
grant execute on function get_papoai_r5_readiness_v1() to service_role;

CREATE OR REPLACE FUNCTION public.prepare_papoai_commerce_order_confirmation_v2(p_conversation_id uuid, p_payment_method text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_method text;
  v_preview jsonb;
  v_profile jsonb;
  v_cart public.carts%rowtype;
  v_basket public.basket_templates%rowtype;
  v_items jsonb:='[]'::jsonb;
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_action_id uuid;
  v_fingerprint text;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;
  if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;

  v_profile:=public.get_papoai_commerce_checkout_profile_v2(p_conversation_id);
  v_method:=public.normalize_whatsapp_basket_payment_method_v1(
    coalesce(nullif(trim(p_payment_method),''),v_profile->>'payment_method')
  );

  if v_method is null then
    return jsonb_build_object(
      'ok',false,'needs_payment_method',true,
      'allowed',jsonb_build_array('pix','cash','credit_card','food_card')
    );
  end if;

  perform public.set_papoai_checkout_payment_method_v1(p_conversation_id,v_method);
  v_preview:=public.get_papoai_order_preview_v2(p_conversation_id,v_method);

  if not coalesce((v_preview->>'ready')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'checkout_not_ready',true,
      'next_step',public.get_papoai_checkout_next_step_v1(p_conversation_id),
      'preview',v_preview
    );
  end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','cart_not_found'); end if;

  perform public.recalculate_papoai_commerce_cart_v1(v_cart.id);
  select * into v_cart from public.carts where id=v_cart.id for update;

  if v_cart.basket_id is not null then
    select * into v_basket from public.basket_templates where id=v_cart.basket_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',ci.product_id,
    'sku',p.sku,
    'name',p.name,
    'source',ci.source,
    'quantity',ci.quantity,
    'unit_price',case
      when ci.source in ('addon','substitution')
        then coalesce(ci.commercial_unit_price,ci.unit_price,0)
      else coalesce(ci.unit_price,0)
    end,
    'line_total',round(
      ci.quantity*case
        when ci.source in ('addon','substitution')
          then coalesce(ci.commercial_unit_price,ci.unit_price,0)
        else coalesce(ci.unit_price,0)
      end,2
    ),
    'commercial_delta',coalesce(ci.commercial_delta,0)
  ) order by ci.created_at,ci.product_id),'[]'::jsonb)
  into v_items
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  where ci.cart_id=v_cart.id and ci.quantity>0;

  v_fingerprint:=public.papoai_commerce_cart_fingerprint_v1(v_cart.id);

  v_snapshot:=jsonb_build_object(
    'schema_version','papoai-order-prepared-v2',
    'conversation_id',p_conversation_id,
    'cart_id',v_cart.id,
    'cart_version',v_cart.version,
    'cart_fingerprint',v_fingerprint,
    'basket_id',v_cart.basket_id,
    'basket_name',v_basket.name,
    'items',v_items,
    'fiscal_subtotal',v_cart.fiscal_subtotal,
    'other_expenses',v_cart.other_expenses,
    'discount',v_cart.discount,
    'basket_hidden_adjustment',v_cart.basket_hidden_adjustment,
    'total',v_cart.total,
    'customer_name',v_profile->>'name',
    'delivery_address',v_profile->'address',
    'payment_method',v_method,
    'payment_label',public.whatsapp_basket_payment_label_v1(v_method),
    'prepared_at',now()
  );
  v_snapshot_hash:=md5(v_snapshot::text);

  update public.papoai_commerce_pending_actions
     set status='cancelled',resolved_at=now(),updated_at=now()
   where conversation_id=p_conversation_id and status='pending';

  insert into public.papoai_commerce_pending_actions(
    conversation_id,action_type,status,payload,expires_at
  ) values(
    p_conversation_id,'confirm_order','pending',
    jsonb_build_object(
      'cart_id',v_cart.id,
      'cart_version',v_cart.version,
      'cart_fingerprint',v_fingerprint,
      'prepared_total',v_cart.total,
      'payment_method',v_method,
      'payment_label',public.whatsapp_basket_payment_label_v1(v_method),
      'checkout_name',v_profile->>'name',
      'delivery_address',v_profile->'address',
      'basket_id',v_cart.basket_id,
      'prepared_snapshot',v_snapshot,
      'prepared_snapshot_hash',v_snapshot_hash,
      'prepared_at',now()
    ),
    now()+interval '15 minutes'
  )
  returning id into v_action_id;

  update public.whatsapp_sales_state
     set awaiting='order_confirmation',
         pending_payment_method=v_method,
         last_action='order_confirmation_prepared',
         updated_at=now()
   where conversation_id=p_conversation_id;

  return jsonb_build_object(
    'ok',true,
    'pending_action_id',v_action_id,
    'action_type','confirm_order',
    'payment_method',v_method,
    'payment_label',public.whatsapp_basket_payment_label_v1(v_method),
    'total',v_cart.total,
    'summary',v_preview->'summary',
    'prepared_snapshot_hash',v_snapshot_hash,
    'requires_confirmation',true,
    'expires_in_seconds',900,
    'writes_performed',false
  );
end;
$function$
revoke all on function prepare_papoai_commerce_order_confirmation_v2(uuid,text) from public,anon,authenticated;
grant execute on function prepare_papoai_commerce_order_confirmation_v2(uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.record_papoai_checkout_prompt_v1(p_conversation_id uuid, p_prompt_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_state public.papoai_checkout_state%rowtype;
  v_key text:=left(lower(trim(coalesce(p_prompt_key,''))),80);
begin
  if v_key='' then raise exception 'prompt_key_required'; end if;

  insert into public.papoai_checkout_state(conversation_id)
  values(p_conversation_id)
  on conflict(conversation_id) do nothing;

  select * into v_state
  from public.papoai_checkout_state
  where conversation_id=p_conversation_id
  for update;

  if v_state.last_prompt_key=v_key then
    return jsonb_build_object(
      'ok',true,'counted',false,'question_count',v_state.question_count,
      'reason','same_prompt_replay'
    );
  end if;

  if v_state.question_count>=2 then
    return jsonb_build_object(
      'ok',false,'counted',false,'question_count',v_state.question_count,
      'reason','checkout_question_limit'
    );
  end if;

  update public.papoai_checkout_state
     set question_count=question_count+1,
         last_prompt_key=v_key,
         updated_at=now()
   where conversation_id=p_conversation_id
   returning * into v_state;

  return jsonb_build_object(
    'ok',true,'counted',true,'question_count',v_state.question_count,
    'prompt_key',v_key
  );
end;
$function$
revoke all on function record_papoai_checkout_prompt_v1(uuid,text) from public,anon,authenticated;
grant execute on function record_papoai_checkout_prompt_v1(uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.save_papoai_commerce_checkout_profile_pending_v2(p_conversation_id uuid, p_name text, p_street text, p_number text, p_complement text, p_neighborhood text, p_city text, p_postal_code text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_saved jsonb;
  v_payment jsonb:=null;
begin
  v_saved:=public.save_papoai_commerce_checkout_profile_pending_v1(
    p_conversation_id,p_name,p_street,p_number,p_complement,p_neighborhood,
    p_city,p_postal_code,p_reference
  );

  if not coalesce((v_saved->>'ok')::boolean,false) then
    return v_saved;
  end if;

  insert into public.papoai_checkout_state(
    conversation_id,saved_address_decision,address_confirmed_at
  ) values(
    p_conversation_id,'replaced',now()
  )
  on conflict(conversation_id) do update set
    saved_address_decision='replaced',
    address_confirmed_at=now(),
    updated_at=now();

  if nullif(trim(coalesce(p_payment_method,'')),'') is not null then
    v_payment:=public.set_papoai_checkout_payment_method_v1(
      p_conversation_id,p_payment_method
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'profile',public.get_papoai_commerce_checkout_profile_v2(p_conversation_id),
    'payment',v_payment,
    'persisted_to_customer',false
  );
end;
$function$
revoke all on function save_papoai_commerce_checkout_profile_pending_v2(uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function save_papoai_commerce_checkout_profile_pending_v2(uuid,text,text,text,text,text,text,text,text,text) to service_role;

CREATE OR REPLACE FUNCTION public.set_papoai_checkout_payment_method_v1(p_conversation_id uuid, p_payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_method text:=public.normalize_whatsapp_basket_payment_method_v1(p_payment_method);
begin
  if v_method is null then
    return jsonb_build_object(
      'ok',false,
      'reason','payment_method_invalid',
      'allowed',jsonb_build_array('pix','cash','credit_card','food_card')
    );
  end if;

  insert into public.papoai_checkout_state(conversation_id,payment_method)
  values(p_conversation_id,v_method)
  on conflict(conversation_id) do update set
    payment_method=excluded.payment_method,
    updated_at=now();

  insert into public.whatsapp_sales_state(conversation_id,pending_payment_method,awaiting,last_action)
  values(p_conversation_id,v_method,null,'payment_method_captured')
  on conflict(conversation_id) do update set
    pending_payment_method=v_method,
    awaiting=null,
    last_action='payment_method_captured',
    updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'payment_method',v_method,
    'payment_label',public.whatsapp_basket_payment_label_v1(v_method)
  );
end;
$function$
revoke all on function set_papoai_checkout_payment_method_v1(uuid,text) from public,anon,authenticated;
grant execute on function set_papoai_checkout_payment_method_v1(uuid,text) to service_role;


insert into public.papoai_ai_tool_registry(
  tool_key,domain,description,operation_kind,executor_kind,executor_target,
  implementation_status,runtime_enabled,requires_write_gate,requires_confirmation,
  max_result_items,input_schema,output_policy,metadata
)
values
(
  'get_checkout_next_step','checkout',
  'Determina o próximo passo mínimo do checkout sem repetir dados já conhecidos.',
  'read','rpc','get_papoai_checkout_next_step_v1',
  'ready',false,false,false,1,
  '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
  '{"max_checkout_questions":2}'::jsonb,
  '{"r5":true}'::jsonb
),
(
  'confirm_delivery_address','checkout',
  'Confirma ou rejeita o endereço de entrega já conhecido do cliente.',
  'write','rpc','confirm_papoai_checkout_saved_address_v1',
  'ready',false,true,false,1,
  '{"type":"object","required":["accept"],"properties":{"accept":{"type":"boolean"}},"additionalProperties":false}'::jsonb,
  '{"does_not_create_order":true}'::jsonb,
  '{"r5":true}'::jsonb
),
(
  'set_payment_method','checkout',
  'Registra a forma de pagamento escolhida para o checkout atual.',
  'write','rpc','set_papoai_checkout_payment_method_v1',
  'ready',false,true,false,1,
  '{"type":"object","required":["payment_method"],"properties":{"payment_method":{"type":"string"}},"additionalProperties":false}'::jsonb,
  '{"does_not_create_order":true}'::jsonb,
  '{"r5":true}'::jsonb
)
on conflict(tool_key) do update set
  description=excluded.description,
  operation_kind=excluded.operation_kind,
  executor_kind=excluded.executor_kind,
  executor_target=excluded.executor_target,
  implementation_status=excluded.implementation_status,
  requires_write_gate=excluded.requires_write_gate,
  requires_confirmation=excluded.requires_confirmation,
  max_result_items=excluded.max_result_items,
  input_schema=excluded.input_schema,
  output_policy=excluded.output_policy,
  metadata=public.papoai_ai_tool_registry.metadata||excluded.metadata,
  updated_at=now();

update public.papoai_ai_tool_registry
set executor_target='get_papoai_order_preview_v2',
    input_schema='{"type":"object","properties":{"payment_method":{"type":["string","null"]}},"additionalProperties":false}'::jsonb,
    metadata=metadata||jsonb_build_object('checkout_version','v2'),
    updated_at=now()
where tool_key='preview_order';

update public.papoai_ai_tool_registry
set executor_target='prepare_papoai_commerce_order_confirmation_v2',
    metadata=metadata||jsonb_build_object('checkout_version','v2'),
    updated_at=now()
where tool_key='prepare_order_confirmation';

update public.papoai_ai_tool_registry
set executor_target='confirm_papoai_commerce_pending_action_v2',
    metadata=metadata||jsonb_build_object('checkout_version','v2'),
    updated_at=now()
where tool_key='confirm_order';

update public.papoai_ai_tool_registry
set input_schema='{
  "type":"object",
  "properties":{
    "name":{"type":"string"},
    "address":{
      "type":"object",
      "properties":{
        "street":{"type":"string"},
        "number":{"type":"string"},
        "complement":{"type":"string"},
        "neighborhood":{"type":"string"},
        "city":{"type":"string"},
        "postal_code":{"type":"string"},
        "reference":{"type":"string"}
      },
      "additionalProperties":false
    },
    "payment_method":{"type":["string","null"]}
  },
  "additionalProperties":false
}'::jsonb,
metadata=metadata||jsonb_build_object('checkout_version','v2'),
updated_at=now()
where tool_key='update_checkout_profile';

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'r5_programming_status','complete',
  'checkout_version','v2',
  'checkout_context_version','v3',
  'max_checkout_questions',2,
  'saved_address_confirmation_required',true,
  'replacement_address_can_include_payment',true,
  'order_snapshot_version',1,
  'order_snapshot_immutable',true,
  'confirmation_requires_explicit_yes',true,
  'confirmation_idempotent_replay_minutes',30,
  'cart_change_requires_reconfirmation',true,
  'local_order_before_bling',true,
  'bling_failure_preserves_local_order',true,
  'human_precedence_absolute',true,
  'ai_resume_requires_closed_handoff',true,
  'edge_version',36
),
updated_at=now()
where id=1;

commit;

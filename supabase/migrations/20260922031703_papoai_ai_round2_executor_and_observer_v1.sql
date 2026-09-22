
begin;

alter table public.papoai_ai_runtime_config
  add column if not exists execution_mode text not null default 'off',
  add column if not exists observe_live_messages boolean not null default false,
  add column if not exists allow_read_tool_execution boolean not null default false,
  add column if not exists allow_write_tool_execution boolean not null default false;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.papoai_ai_runtime_config'::regclass
      and conname='papoai_ai_runtime_config_execution_mode_check'
  ) then
    alter table public.papoai_ai_runtime_config
      add constraint papoai_ai_runtime_config_execution_mode_check
      check (execution_mode in ('off','observe','active'));
  end if;
end $$;

update public.papoai_ai_runtime_config
set execution_mode='off',
    observe_live_messages=false,
    allow_read_tool_execution=false,
    allow_write_tool_execution=false,
    enabled=false,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'round2_complete_policy',true,
      'planner_mode','structured_observe_first',
      'live_observation_requires_explicit_flag',true,
      'writes_require_three_gates',jsonb_build_array(
        'ai_runtime_active',
        'tool_runtime_enabled',
        'commerce_write_enabled'
      )
    ),
    updated_at=now()
where id=1;

create table if not exists public.papoai_ai_planner_runs (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid,
  conversation_id uuid references public.conversations(id) on delete set null,
  mode text not null check (mode in ('manual','observe','active')),
  model text not null,
  reasoning_effort text not null,
  context_schema_version text,
  context_bytes integer not null default 0,
  message_length integer not null default 0,
  decision text,
  confidence numeric,
  commercial_opportunity text,
  proposed_tool_calls jsonb not null default '[]'::jsonb,
  response_draft text,
  response_id text,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  success boolean not null default false,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists papoai_ai_planner_runs_conversation_created_idx
  on public.papoai_ai_planner_runs(conversation_id,created_at desc);

create index if not exists papoai_ai_planner_runs_created_idx
  on public.papoai_ai_planner_runs(created_at desc);

alter table public.papoai_ai_planner_runs enable row level security;
revoke all on table public.papoai_ai_planner_runs from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_ai_planner_runs to service_role;

create table if not exists public.papoai_ai_tool_audit (
  id bigserial primary key,
  correlation_id uuid,
  conversation_id uuid references public.conversations(id) on delete set null,
  tool_key text not null,
  operation_kind text not null,
  execute_requested boolean not null default false,
  allowed boolean not null default false,
  executed boolean not null default false,
  success boolean not null default false,
  reason text,
  arguments_digest text,
  result_summary jsonb not null default '{}'::jsonb,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists papoai_ai_tool_audit_conversation_created_idx
  on public.papoai_ai_tool_audit(conversation_id,created_at desc);

alter table public.papoai_ai_tool_audit enable row level security;
revoke all on table public.papoai_ai_tool_audit from public,anon,authenticated;
grant select,insert on table public.papoai_ai_tool_audit to service_role;
grant usage,select on sequence public.papoai_ai_tool_audit_id_seq to service_role;

insert into public.papoai_ai_tool_registry
(tool_key,domain,description,operation_kind,executor_kind,executor_target,implementation_status,runtime_enabled,requires_write_gate,requires_confirmation,max_result_items,input_schema,output_policy,metadata)
values
('start_basket','baskets','Inicia um carrinho a partir de uma cesta escolhida pelo cliente.','write','commerce_command','start_basket','ready',false,true,false,1,
 '{"type":"object","required":["basket"],"properties":{"basket":{"type":"string"}},"additionalProperties":false}'::jsonb,
 '{"recalculate":true}'::jsonb,'{}'::jsonb),
('prepare_order_confirmation','checkout','Prepara a confirmação final do pedido com forma de pagamento e snapshot atual.','write','commerce_command','prepare_order_confirmation','ready',false,true,false,1,
 '{"type":"object","required":["payment_method"],"properties":{"payment_method":{"type":"string"}},"additionalProperties":false}'::jsonb,
 '{"requires_final_confirmation":true}'::jsonb,'{}'::jsonb),
('cancel_pending','conversation','Cancela uma ação pendente quando o cliente recusa ou muda de ideia.','write','rpc','cancel_papoai_commerce_pending_actions_v1','ready',false,true,false,1,
 '{"type":"object","properties":{"reason":{"type":"string"}},"additionalProperties":false}'::jsonb,
 '{"safe_cancel":true}'::jsonb,'{}'::jsonb)
on conflict(tool_key) do update set
  domain=excluded.domain,
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

create or replace function public.get_papoai_ai_runtime_config_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'enabled',c.enabled,
    'execution_mode',c.execution_mode,
    'observe_live_messages',c.observe_live_messages,
    'allow_read_tool_execution',c.allow_read_tool_execution,
    'allow_write_tool_execution',c.allow_write_tool_execution,
    'primary_model',c.primary_model,
    'utility_model',c.utility_model,
    'primary_reasoning_effort',c.primary_reasoning_effort,
    'utility_reasoning_effort',c.utility_reasoning_effort,
    'max_recent_messages',c.max_recent_messages,
    'max_message_chars',c.max_message_chars,
    'max_context_bytes',c.max_context_bytes,
    'max_output_tokens',c.max_output_tokens,
    'max_tool_calls',c.max_tool_calls,
    'prompt_cache_key',c.prompt_cache_key,
    'prompt_cache_ttl',c.prompt_cache_ttl,
    'metadata',c.metadata
  )
  from public.papoai_ai_runtime_config c
  where c.id=1;
$$;

revoke all on function public.get_papoai_ai_runtime_config_v1()
  from public,anon,authenticated;
grant execute on function public.get_papoai_ai_runtime_config_v1()
  to service_role;

create or replace function public.get_papoai_ai_planner_tools_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tool_key',t.tool_key,
      'domain',t.domain,
      'description',t.description,
      'operation_kind',t.operation_kind,
      'requires_confirmation',t.requires_confirmation,
      'input_schema',t.input_schema
    )
    order by
      case t.operation_kind when 'read' then 0 when 'write' then 1 else 2 end,
      t.domain,t.tool_key
  ),'[]'::jsonb)
  from public.papoai_ai_tool_registry t
  where t.implementation_status='ready';
$$;

revoke all on function public.get_papoai_ai_planner_tools_v1()
  from public,anon,authenticated;
grant execute on function public.get_papoai_ai_planner_tools_v1()
  to service_role;

create or replace function public.execute_papoai_ai_tool_v1(
  p_conversation_id uuid,
  p_tool_key text,
  p_arguments jsonb default '{}'::jsonb,
  p_execute boolean default false,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
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

  v_digest:=encode(digest(v_args::text,'sha256'),'hex');

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
      v_result:=public.search_papoai_commerce_products_for_customer_v1(
        p_conversation_id,
        v_args->>'query',
        greatest(1,least(coalesce((v_args->>'limit')::integer,3),12))
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

    when 'update_checkout_profile' then
      v_result:=public.save_papoai_commerce_checkout_profile_pending_v1(
        p_conversation_id,
        coalesce(v_args->>'name',''),
        coalesce(v_args#>>'{address,street}',''),
        coalesce(v_args#>>'{address,number}',''),
        coalesce(v_args#>>'{address,complement}',''),
        coalesce(v_args#>>'{address,neighborhood}',''),
        coalesce(v_args#>>'{address,city}',''),
        nullif(v_args#>>'{address,postal_code}',''),
        nullif(v_args#>>'{address,reference}','')
      );

    when 'preview_order' then
      v_result:=public.get_papoai_commerce_checkout_readiness_v1(p_conversation_id);

    when 'prepare_order_confirmation' then
      v_result:=public.prepare_papoai_commerce_order_confirmation_v1(
        p_conversation_id,
        v_args->>'payment_method'
      );

    when 'confirm_order' then
      v_result:=public.confirm_papoai_commerce_pending_action_v1(
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
$$;

revoke all on function public.execute_papoai_ai_tool_v1(uuid,text,jsonb,boolean,uuid)
  from public,anon,authenticated;
grant execute on function public.execute_papoai_ai_tool_v1(uuid,text,jsonb,boolean,uuid)
  to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'ai_round2_status','complete_pending_edge_observer',
  'ai_safe_tool_executor_version','v1',
  'ai_planner_observation_version','v1'
),
updated_at=now()
where id=1;

commit;

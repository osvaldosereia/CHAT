
begin;

create table if not exists public.papoai_ai_runtime_config (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default false,
  primary_model text not null default 'gpt-5.6-terra',
  utility_model text not null default 'gpt-5.6-luna',
  primary_reasoning_effort text not null default 'low'
    check (primary_reasoning_effort in ('none','low','medium','high','xhigh','max')),
  utility_reasoning_effort text not null default 'none'
    check (utility_reasoning_effort in ('none','low','medium','high','xhigh','max')),
  max_recent_messages smallint not null default 6 check (max_recent_messages between 2 and 12),
  max_message_chars integer not null default 700 check (max_message_chars between 200 and 2000),
  max_context_bytes integer not null default 18000 check (max_context_bytes between 6000 and 64000),
  max_output_tokens integer not null default 500 check (max_output_tokens between 128 and 2000),
  max_tool_calls smallint not null default 6 check (max_tool_calls between 1 and 12),
  customer_preference_limit smallint not null default 4 check (customer_preference_limit between 1 and 10),
  frequent_product_limit smallint not null default 5 check (frequent_product_limit between 1 and 12),
  prompt_cache_key text not null default 'dona-antonia-papoai-commerce-ai-v1',
  prompt_cache_ttl text not null default '30m',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.papoai_ai_runtime_config enable row level security;
revoke all on table public.papoai_ai_runtime_config from public, anon, authenticated;
grant select,insert,update,delete on table public.papoai_ai_runtime_config to service_role;

insert into public.papoai_ai_runtime_config(
  id,enabled,primary_model,utility_model,primary_reasoning_effort,utility_reasoning_effort,
  max_recent_messages,max_message_chars,max_context_bytes,max_output_tokens,max_tool_calls,
  customer_preference_limit,frequent_product_limit,prompt_cache_key,prompt_cache_ttl,metadata
)
values(
  1,false,'gpt-5.6-terra','gpt-5.6-luna','low','none',
  6,700,18000,500,6,4,5,'dona-antonia-papoai-commerce-ai-v1','30m',
  jsonb_build_object(
    'architecture','ai_first_tool_driven_context_efficient',
    'primary_role','conversation_recommendation_sales_reasoning',
    'utility_role','summary_classification_low_cost_tasks',
    'commercial_calculation_authority','supabase',
    'catalog_in_prompt',false,
    'full_history_in_prompt',false,
    'context_strategy','progressive_disclosure',
    'production_activation_authorized',false
  )
)
on conflict(id) do update set
  primary_model=excluded.primary_model,
  utility_model=excluded.utility_model,
  primary_reasoning_effort=excluded.primary_reasoning_effort,
  utility_reasoning_effort=excluded.utility_reasoning_effort,
  max_recent_messages=excluded.max_recent_messages,
  max_message_chars=excluded.max_message_chars,
  max_context_bytes=excluded.max_context_bytes,
  max_output_tokens=excluded.max_output_tokens,
  max_tool_calls=excluded.max_tool_calls,
  customer_preference_limit=excluded.customer_preference_limit,
  frequent_product_limit=excluded.frequent_product_limit,
  prompt_cache_key=excluded.prompt_cache_key,
  prompt_cache_ttl=excluded.prompt_cache_ttl,
  metadata=public.papoai_ai_runtime_config.metadata || excluded.metadata,
  updated_at=now();

create table if not exists public.papoai_ai_tool_registry (
  tool_key text primary key,
  domain text not null,
  description text not null,
  operation_kind text not null check (operation_kind in ('read','write','commitment')),
  executor_kind text not null check (executor_kind in ('rpc','commerce_command','context')),
  executor_target text not null,
  implementation_status text not null default 'ready'
    check (implementation_status in ('ready','partial','planned','disabled')),
  runtime_enabled boolean not null default false,
  requires_write_gate boolean not null default false,
  requires_confirmation boolean not null default false,
  max_result_items smallint,
  input_schema jsonb not null default '{}'::jsonb,
  output_policy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.papoai_ai_tool_registry enable row level security;
revoke all on table public.papoai_ai_tool_registry from public, anon, authenticated;
grant select,insert,update,delete on table public.papoai_ai_tool_registry to service_role;

create or replace function public.get_papoai_commerce_product_v1(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'found',true,
      'product_id',p.id,
      'sku',p.sku,
      'gtin',p.gtin,
      'name',p.name,
      'brand',p.brand,
      'category',p.category,
      'subcategory',p.subcategory,
      'packaging',p.packaging,
      'commercial_price',case
        when p.is_offer and coalesce(p.offer_price,0)>0 and p.offer_price<=p.price
          then p.offer_price
        else p.price
      end,
      'regular_price',p.price,
      'is_offer',coalesce(p.is_offer,false),
      'stock',p.stock,
      'image_url',coalesce(p.image_url,p.image_ai_url,p.image_source_url,p.image_original_url),
      'description_short',nullif(trim(coalesce(p.description_short,'')),''),
      'knowledge_status',coalesce(k.enrichment_status,'pending_research'),
      'sellable',true
    )
    from public.products p
    left join public.product_sales_knowledge k on k.product_id=p.id
    where p.id=p_product_id
      and p.is_active=true
      and p.physically_verified=true
      and coalesce(p.stock,0)>0
      and coalesce(p.price,0)>0
  ),jsonb_build_object('found',false,'product_id',p_product_id));
$$;

revoke all on function public.get_papoai_commerce_product_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_product_v1(uuid)
  to service_role;

insert into public.papoai_ai_tool_registry
(tool_key,domain,description,operation_kind,executor_kind,executor_target,implementation_status,runtime_enabled,requires_write_gate,requires_confirmation,max_result_items,input_schema,output_policy,metadata)
values
('identify_customer','customer','Resolve a identidade interna já associada à conversa.','read','context','conversation_identity','ready',false,false,false,1,
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 '{"compact":true,"sensitive_fields":false}'::jsonb,
 '{"automatic_on_ingest":true}'::jsonb),

('get_customer_context','customer','Obtém resumo compacto e seguro do cliente para personalização.','read','rpc','get_papoai_commerce_customer_context_v3','ready',false,false,false,1,
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 '{"compact":true,"sensitive_fields":false}'::jsonb,'{}'::jsonb),

('search_products','catalog','Busca produtos por nome, necessidade, categoria e conhecimento semântico, com personalização quando houver conversa.','read','rpc','search_papoai_commerce_products_for_customer_v1','ready',false,false,false,12,
 '{"type":"object","required":["query"],"properties":{"query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":12}},"additionalProperties":false}'::jsonb,
 '{"max_items":12,"commercial_fields_only":true}'::jsonb,'{}'::jsonb),

('get_product','catalog','Obtém um produto vendável por ID.','read','rpc','get_papoai_commerce_product_v1','ready',false,false,false,1,
 '{"type":"object","required":["product_id"],"properties":{"product_id":{"type":"string","format":"uuid"}},"additionalProperties":false}'::jsonb,
 '{"commercial_fields_only":true}'::jsonb,'{}'::jsonb),

('search_baskets','baskets','Lista as cestas básicas ativas.','read','rpc','get_papoai_commerce_basket_catalog_v1','ready',false,false,false,9,
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 '{"component_prices":false,"max_items":9}'::jsonb,'{}'::jsonb),

('get_basket','baskets','Obtém composição completa e regras de edição de uma cesta.','read','rpc','get_papoai_commerce_basket_detail_v1','ready',false,false,false,1,
 '{"type":"object","required":["basket"],"properties":{"basket":{"type":"string"}},"additionalProperties":false}'::jsonb,
 '{"component_prices":false,"hidden_adjustment":false}'::jsonb,'{}'::jsonb),

('get_offers','offers','Obtém ofertas atuais priorizadas para o cliente quando houver contexto.','read','rpc','get_papoai_commerce_offers_v1','ready',false,false,false,10,
 '{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":10}},"additionalProperties":false}'::jsonb,
 '{"max_items":10}'::jsonb,'{}'::jsonb),

('get_cart','cart','Obtém o carrinho atual, totais e itens sem expor custos internos.','read','rpc','get_papoai_commerce_cart_state_v1','ready',false,false,false,1,
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 '{"component_prices":false,"hidden_adjustment":false}'::jsonb,'{}'::jsonb),

('add_cart_item','cart','Adiciona ou aumenta um produto avulso no carrinho após intenção clara do cliente.','write','commerce_command','set_addon_quantity','ready',false,true,false,1,
 '{"type":"object","required":["product_id","quantity"],"properties":{"product_id":{"type":"string","format":"uuid"},"quantity":{"type":"number","minimum":1}},"additionalProperties":false}'::jsonb,
 '{"recalculate":true}'::jsonb,'{}'::jsonb),

('remove_cart_item','cart','Remove produto do carrinho ou zera quantidade quando permitido.','write','commerce_command','set_quantity_zero','ready',false,true,false,1,
 '{"type":"object","required":["product_id"],"properties":{"product_id":{"type":"string","format":"uuid"}},"additionalProperties":false}'::jsonb,
 '{"recalculate":true}'::jsonb,
 '{"executor_resolution":"resolve_cart_item_then_set_source_quantity"}'::jsonb),

('change_quantity','cart','Altera quantidade de um item existente respeitando a origem do item.','write','commerce_command','set_item_quantity','ready',false,true,false,1,
 '{"type":"object","required":["product_id","quantity"],"properties":{"product_id":{"type":"string","format":"uuid"},"quantity":{"type":"number","minimum":0}},"additionalProperties":false}'::jsonb,
 '{"recalculate":true}'::jsonb,
 '{"executor_resolution":"resolve_cart_item_then_set_source_quantity"}'::jsonb),

('replace_basket_item','cart','Substitui item de cesta por candidato validado.','write','commerce_command','replace_basket_item','ready',false,true,true,1,
 '{"type":"object","required":["source_product_id","replacement_product_id","customer_confirmed"],"properties":{"source_product_id":{"type":"string","format":"uuid"},"replacement_product_id":{"type":"string","format":"uuid"},"customer_confirmed":{"type":"boolean"}},"additionalProperties":false}'::jsonb,
 '{"recalculate":true}'::jsonb,'{}'::jsonb),

('recommend_replacement','recommendation','Recomenda substituição por utilidade e valor sem alterar o carrinho.','read','commerce_command','recommend_value_replacement','ready',false,false,false,3,
 '{"type":"object","required":["source_query"],"properties":{"source_query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":3}},"additionalProperties":false}'::jsonb,
 '{"max_items":3,"no_write":true}'::jsonb,'{}'::jsonb),

('repeat_last_purchase','orders','Prepara repetição da última compra com condições atuais, sem copiar preços históricos.','write','commerce_command','repeat_last_purchase','ready',false,true,true,1,
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 '{"current_price_stock":true,"historical_substitutions":false}'::jsonb,'{}'::jsonb),

('update_checkout_profile','checkout','Salva dados pendentes de checkout, sem promover cadastro definitivo antes da confirmação final.','write','rpc','save_papoai_commerce_checkout_profile_pending_v1','ready',false,true,false,1,
 '{"type":"object","properties":{"name":{"type":"string"},"address":{"type":"object"}},"additionalProperties":false}'::jsonb,
 '{"pending_only":true}'::jsonb,'{}'::jsonb),

('preview_order','checkout','Verifica prontidão e apresenta resumo do pedido antes da confirmação.','read','commerce_command','checkout_readiness','ready',false,false,false,1,
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 '{"no_order_write":true}'::jsonb,'{}'::jsonb),

('confirm_order','orders','Confirma a ação final preparada e cria o pedido de forma idempotente.','commitment','commerce_command','confirm_pending','ready',false,true,true,1,
 '{"type":"object","required":["confirm"],"properties":{"confirm":{"type":"boolean"}},"additionalProperties":false}'::jsonb,
 '{"idempotent":true}'::jsonb,'{}'::jsonb),

('request_handoff','handoff','Solicita atendimento humano no PapoAI e faz a IA ficar silenciosa.','commitment','rpc','queue_papoai_commerce_handoff_v1','ready',false,false,false,1,
 '{"type":"object","required":["reason"],"properties":{"reason":{"type":"string"},"summary":{"type":"string"}},"additionalProperties":false}'::jsonb,
 '{"human_precedence":true}'::jsonb,'{}'::jsonb)
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
  metadata=public.papoai_ai_tool_registry.metadata || excluded.metadata,
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

create or replace function public.get_papoai_ai_tool_registry_v1(p_include_disabled boolean default false)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tool_key',t.tool_key,
    'domain',t.domain,
    'description',t.description,
    'operation_kind',t.operation_kind,
    'executor_kind',t.executor_kind,
    'executor_target',t.executor_target,
    'implementation_status',t.implementation_status,
    'runtime_enabled',t.runtime_enabled,
    'requires_write_gate',t.requires_write_gate,
    'requires_confirmation',t.requires_confirmation,
    'max_result_items',t.max_result_items,
    'input_schema',t.input_schema,
    'output_policy',t.output_policy,
    'metadata',t.metadata
  ) order by
    case t.operation_kind when 'read' then 0 when 'write' then 1 else 2 end,
    t.domain,t.tool_key
  ),'[]'::jsonb)
  from public.papoai_ai_tool_registry t
  where p_include_disabled or t.runtime_enabled=true;
$$;

revoke all on function public.get_papoai_ai_tool_registry_v1(boolean)
  from public,anon,authenticated;
grant execute on function public.get_papoai_ai_tool_registry_v1(boolean)
  to service_role;

create or replace function public.get_papoai_ai_context_pack_v1(
  p_conversation_id uuid,
  p_current_message text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_ai_runtime_config%rowtype;
  v_conv public.conversations%rowtype;
  v_customer jsonb:='{}'::jsonb;
  v_cart jsonb:='{}'::jsonb;
  v_human jsonb:='{}'::jsonb;
  v_checkout jsonb:='{}'::jsonb;
  v_recent jsonb:='[]'::jsonb;
  v_direct jsonb:='[]'::jsonb;
  v_soft jsonb:='[]'::jsonb;
  v_frequent jsonb:='[]'::jsonb;
  v_cart_items jsonb:='[]'::jsonb;
  v_governor jsonb:='{}'::jsonb;
  v_pack jsonb;
  v_bytes integer;
begin
  select * into v_cfg
  from public.papoai_ai_runtime_config
  where id=1;

  if not found then
    raise exception 'papoai_ai_runtime_config_missing';
  end if;

  select * into v_conv
  from public.conversations
  where id=p_conversation_id;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'reason','conversation_not_found',
      'conversation_id',p_conversation_id
    );
  end if;

  v_customer:=public.get_papoai_commerce_customer_context_v3(p_conversation_id);
  v_cart:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
  v_human:=public.get_papoai_commerce_human_precedence_v1(p_conversation_id);
  v_checkout:=public.get_papoai_commerce_checkout_profile_v1(p_conversation_id);

  select coalesce(jsonb_agg(x.value),'[]'::jsonb)
  into v_direct
  from (
    select value
    from jsonb_array_elements(coalesce(v_customer->'direct_preferences','[]'::jsonb))
    limit v_cfg.customer_preference_limit
  ) x;

  select coalesce(jsonb_agg(x.value),'[]'::jsonb)
  into v_soft
  from (
    select value
    from jsonb_array_elements(coalesce(v_customer->'soft_preferences','[]'::jsonb))
    limit greatest(1,v_cfg.customer_preference_limit-1)
  ) x;

  select coalesce(jsonb_agg(x.value),'[]'::jsonb)
  into v_frequent
  from (
    select value
    from jsonb_array_elements(coalesce(v_customer->'frequent_products','[]'::jsonb))
    limit v_cfg.frequent_product_limit
  ) x;

  if coalesce((v_cart->>'has_cart')::boolean,false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id',x.value->>'product_id',
      'name',x.value->>'name',
      'quantity',x.value->'quantity',
      'source',x.value->>'source',
      'category',x.value->>'category',
      'is_offer',coalesce((x.value->>'is_offer')::boolean,false)
    )),'[]'::jsonb)
    into v_cart_items
    from (
      select value
      from jsonb_array_elements(coalesce(v_cart->'items','[]'::jsonb))
      limit 12
    ) x;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'direction',r.direction,
    'message_type',r.message_type,
    'text',left(r.text_value,v_cfg.max_message_chars),
    'created_at',r.created_at
  ) order by r.created_at),'[]'::jsonb)
  into v_recent
  from (
    select
      m.direction,
      m.message_type,
      coalesce(nullif(trim(m.transcript),''),nullif(trim(m.body_text),'')) as text_value,
      m.created_at
    from public.messages m
    where m.conversation_id=p_conversation_id
      and coalesce(nullif(trim(m.transcript),''),nullif(trim(m.body_text),'')) is not null
    order by m.created_at desc
    limit v_cfg.max_recent_messages
  ) r;

  select coalesce(jsonb_build_object(
    'topic_key',g.topic_key,
    'clarification_count',g.clarification_count,
    'last_question_key',g.last_question_key,
    'last_action',g.last_action,
    'last_reason',g.last_reason,
    'delegated',g.delegated
  ),'{}'::jsonb)
  into v_governor
  from public.papoai_conversation_governor_state g
  where g.conversation_id=p_conversation_id
  limit 1;

  v_pack:=jsonb_build_object(
    'schema_version','papoai-ai-context-v1',
    'ok',true,
    'current_message',left(coalesce(p_current_message,''),2000),
    'conversation',jsonb_build_object(
      'conversation_id',v_conv.id,
      'stage',v_conv.stage,
      'mode',v_conv.mode,
      'response_preference',v_conv.response_preference,
      'sales_pressure_level',v_conv.sales_pressure_level,
      'proactive_offer_count',v_conv.proactive_offer_count,
      'upsell_declined',v_conv.upsell_declined,
      'fast_checkout',v_conv.fast_checkout
    ),
    'human_precedence',jsonb_build_object(
      'human_active',coalesce((v_human->>'human_active')::boolean,false),
      'reason',v_human->>'reason'
    ),
    'customer_summary',jsonb_build_object(
      'known_customer',coalesce((v_customer->>'known_customer')::boolean,false),
      'first_name',v_customer->>'first_name',
      'preferred_reply',v_customer->>'preferred_reply',
      'order_count',coalesce((v_customer->>'order_count')::integer,0),
      'last_order_at',v_customer->>'last_order_at',
      'delivery_ready',coalesce((v_customer->>'delivery_ready')::boolean,false),
      'conversation_summary',left(coalesce(v_customer->>'conversation_summary',''),700),
      'direct_preferences',v_direct,
      'soft_preferences',v_soft,
      'favorite_basket',v_customer->'favorite_basket',
      'frequent_products',v_frequent,
      'purchase_frequency_label',v_customer->>'purchase_frequency_label',
      'personalization_available',coalesce((v_customer->>'personalization_available')::boolean,false),
      'sensitive_fields_included',false
    ),
    'recent_messages',v_recent,
    'cart',case
      when coalesce((v_cart->>'has_cart')::boolean,false) then jsonb_build_object(
        'has_cart',true,
        'cart_id',v_cart->>'cart_id',
        'basket',case
          when v_cart->'basket' is null or v_cart->'basket'='null'::jsonb then null
          else jsonb_build_object(
            'id',v_cart#>>'{basket,id}',
            'name',v_cart#>>'{basket,display_name}'
          )
        end,
        'total',v_cart->'total',
        'pricing_status',v_cart->>'pricing_status',
        'version',v_cart->'version',
        'items',v_cart_items
      )
      else jsonb_build_object('has_cart',false)
    end,
    'checkout',jsonb_build_object(
      'complete',coalesce((v_checkout->>'complete')::boolean,false),
      'missing',coalesce(v_checkout->'missing','[]'::jsonb),
      'known_customer',coalesce((v_checkout->>'known_customer')::boolean,false),
      'delivery_city',v_checkout#>>'{address,city}',
      'full_address_included',false
    ),
    'governor',v_governor,
    'policies',jsonb_build_object(
      'max_segmenting_questions',2,
      'delegation_means_recommend',true,
      'ai_may_calculate_totals',false,
      'commercial_calculation_authority','supabase',
      'full_catalog_in_context',false,
      'full_history_in_context',false,
      'sensitive_customer_fields_in_context',false
    )
  );

  v_bytes:=octet_length(v_pack::text);

  return v_pack || jsonb_build_object(
    'context_budget',jsonb_build_object(
      'bytes',v_bytes,
      'limit_bytes',v_cfg.max_context_bytes,
      'within_budget',v_bytes<=v_cfg.max_context_bytes,
      'recent_message_limit',v_cfg.max_recent_messages
    )
  );
end;
$$;

revoke all on function public.get_papoai_ai_context_pack_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_papoai_ai_context_pack_v1(uuid,text)
  to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'ai_architecture','ai_first_tool_driven_context_efficient',
  'ai_context_pack_version','v1',
  'ai_tool_registry_version','v1',
  'ai_primary_model_policy','gpt-5.6-terra',
  'ai_utility_model_policy','gpt-5.6-luna',
  'ai_context_full_catalog_forbidden',true,
  'ai_context_full_history_forbidden',true
),
updated_at=now()
where id=1;

commit;

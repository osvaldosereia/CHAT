
begin;

create table if not exists public.papoai_commercial_policy_config (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default false,
  max_segmenting_questions smallint not null default 2 check(max_segmenting_questions between 0 and 3),
  max_recommendations smallint not null default 3 check(max_recommendations between 1 and 5),
  max_proactive_offers_per_cart smallint not null default 1 check(max_proactive_offers_per_cart between 0 and 3),
  rejection_cooldown_days smallint not null default 7 check(rejection_cooldown_days between 1 and 60),
  strong_min_discount_percent numeric not null default 15 check(strong_min_discount_percent between 0 and 100),
  strong_min_discount_amount numeric not null default 5 check(strong_min_discount_amount>=0),
  strong_min_personalized_score numeric not null default 50 check(strong_min_personalized_score>=0),
  suppress_during_checkout boolean not null default true,
  suppress_when_pending_action boolean not null default true,
  suppress_after_decline boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.papoai_commercial_policy_config enable row level security;
revoke all on table public.papoai_commercial_policy_config from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_commercial_policy_config to service_role;

insert into public.papoai_commercial_policy_config(
  id,enabled,max_segmenting_questions,max_recommendations,
  max_proactive_offers_per_cart,rejection_cooldown_days,
  strong_min_discount_percent,strong_min_discount_amount,strong_min_personalized_score,
  suppress_during_checkout,suppress_when_pending_action,suppress_after_decline,metadata
)
values(
  1,false,2,3,1,7,15,5,50,true,true,true,
  jsonb_build_object(
    'sales_philosophy','help_first_sell_relevantly',
    'weak_signal_behavior','do_not_interrupt',
    'strong_signal_behavior','may_offer_once_after_resolving_primary_need',
    'decline_behavior','respect_and_stop',
    'delegation_behavior','recommend_do_not_reask',
    'customer_history_behavior','use_discreetly_not_intrusively'
  )
)
on conflict(id) do update set
  max_segmenting_questions=excluded.max_segmenting_questions,
  max_recommendations=excluded.max_recommendations,
  max_proactive_offers_per_cart=excluded.max_proactive_offers_per_cart,
  rejection_cooldown_days=excluded.rejection_cooldown_days,
  strong_min_discount_percent=excluded.strong_min_discount_percent,
  strong_min_discount_amount=excluded.strong_min_discount_amount,
  strong_min_personalized_score=excluded.strong_min_personalized_score,
  suppress_during_checkout=excluded.suppress_during_checkout,
  suppress_when_pending_action=excluded.suppress_when_pending_action,
  suppress_after_decline=excluded.suppress_after_decline,
  metadata=public.papoai_commercial_policy_config.metadata||excluded.metadata,
  updated_at=now();

alter table public.papoai_ai_planner_runs
  add column if not exists journey_stage text,
  add column if not exists sales_next_step text,
  add column if not exists commercial_reason text,
  add column if not exists proactive_offer_requested boolean,
  add column if not exists policy_adjusted boolean not null default false,
  add column if not exists policy_violations jsonb not null default '[]'::jsonb;

create or replace function public.classify_papoai_commercial_opportunity_v1(
  p_has_cart boolean,
  p_human_active boolean,
  p_pending_action boolean,
  p_near_checkout boolean,
  p_proactive_offer_count integer,
  p_max_proactive_offers integer,
  p_rejected_recently boolean,
  p_has_candidate boolean,
  p_bought_before boolean,
  p_personalized_score numeric,
  p_discount_percent numeric,
  p_discount_amount numeric,
  p_is_complement boolean,
  p_min_score numeric default 50,
  p_min_discount_percent numeric default 15,
  p_min_discount_amount numeric default 5
)
returns jsonb
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_strong boolean:=false;
  v_reason text:='no_candidate';
begin
  if coalesce(p_human_active,false) then
    return jsonb_build_object('level','none','reason','human_active');
  end if;

  if not coalesce(p_has_cart,false) then
    return jsonb_build_object('level','none','reason','no_active_cart');
  end if;

  if coalesce(p_pending_action,false) then
    return jsonb_build_object('level','none','reason','pending_action');
  end if;

  if coalesce(p_near_checkout,false) then
    return jsonb_build_object('level','none','reason','checkout_in_progress');
  end if;

  if coalesce(p_rejected_recently,false) then
    return jsonb_build_object('level','none','reason','recent_offer_rejection');
  end if;

  if coalesce(p_proactive_offer_count,0)>=greatest(0,coalesce(p_max_proactive_offers,1)) then
    return jsonb_build_object('level','none','reason','proactive_offer_limit_reached');
  end if;

  if not coalesce(p_has_candidate,false) then
    return jsonb_build_object('level','none','reason','no_offer_candidate');
  end if;

  v_strong:=
    coalesce(p_bought_before,false)
    or coalesce(p_personalized_score,0)>=coalesce(p_min_score,50)
    or coalesce(p_discount_percent,0)>=coalesce(p_min_discount_percent,15)
    or coalesce(p_discount_amount,0)>=coalesce(p_min_discount_amount,5)
    or (
      coalesce(p_is_complement,false)
      and coalesce(p_personalized_score,0)>=greatest(30,coalesce(p_min_score,50)*0.7)
    );

  if v_strong then
    v_reason:=case
      when coalesce(p_bought_before,false) then 'customer_bought_before'
      when coalesce(p_personalized_score,0)>=coalesce(p_min_score,50) then 'strong_personalized_score'
      when coalesce(p_is_complement,false)
        and coalesce(p_personalized_score,0)>=greatest(30,coalesce(p_min_score,50)*0.7)
        then 'strong_cart_complement'
      else 'meaningful_discount'
    end;
    return jsonb_build_object('level','strong','reason',v_reason);
  end if;

  return jsonb_build_object('level','weak','reason','candidate_without_strong_signal');
end;
$$;

revoke all on function public.classify_papoai_commercial_opportunity_v1(
  boolean,boolean,boolean,boolean,integer,integer,boolean,boolean,boolean,numeric,numeric,numeric,boolean,numeric,numeric,numeric
) from public,anon,authenticated;
grant execute on function public.classify_papoai_commercial_opportunity_v1(
  boolean,boolean,boolean,boolean,integer,integer,boolean,boolean,boolean,numeric,numeric,numeric,boolean,numeric,numeric,numeric
) to service_role;

create or replace function public.get_papoai_sales_journey_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_conv public.conversations%rowtype;
  v_cart public.carts%rowtype;
  v_sales public.whatsapp_sales_state%rowtype;
  v_pending public.papoai_commerce_pending_actions%rowtype;
  v_human jsonb:='{}'::jsonb;
  v_stage text:='discovery';
  v_reason text:='no_active_cart';
begin
  select * into v_conv from public.conversations where id=p_conversation_id;
  if not found then
    return jsonb_build_object('stage','unknown','reason','conversation_not_found');
  end if;

  v_human:=public.get_papoai_commerce_human_precedence_v1(p_conversation_id);
  if coalesce((v_human->>'human_active')::boolean,false) then
    return jsonb_build_object('stage','human','reason','human_active');
  end if;

  select * into v_pending
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id
    and status='pending'
    and expires_at>now()
  order by created_at desc
  limit 1;

  if found and v_pending.action_type='confirm_order' then
    return jsonb_build_object(
      'stage','confirmation',
      'reason','order_confirmation_pending',
      'pending_action_type',v_pending.action_type
    );
  end if;

  select * into v_sales
  from public.whatsapp_sales_state
  where conversation_id=p_conversation_id;

  if found and coalesce(v_sales.awaiting,'') in ('checkout_profile','payment_method','order_confirmation') then
    return jsonb_build_object(
      'stage','checkout',
      'reason','checkout_state_active',
      'awaiting',v_sales.awaiting
    );
  end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1;

  if found then
    if v_cart.basket_id is not null then
      v_stage:='personalization';
      v_reason:='basket_cart_active';
    else
      v_stage:='selection';
      v_reason:='product_cart_active';
    end if;
  elsif coalesce(v_conv.stage,'') in ('checkout','confirmation','completed') then
    v_stage:=v_conv.stage;
    v_reason:='conversation_stage';
  else
    v_stage:='discovery';
    v_reason:='no_active_cart';
  end if;

  return jsonb_build_object(
    'stage',v_stage,
    'reason',v_reason,
    'conversation_stage',v_conv.stage,
    'has_cart',v_cart.id is not null,
    'cart_id',v_cart.id
  );
end;
$$;

revoke all on function public.get_papoai_sales_journey_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.get_papoai_sales_journey_v1(uuid)
  to service_role;

create or replace function public.get_papoai_commercial_opportunity_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_policy public.papoai_commercial_policy_config%rowtype;
  v_conv public.conversations%rowtype;
  v_cart public.carts%rowtype;
  v_human jsonb:='{}'::jsonb;
  v_journey jsonb:='{}'::jsonb;
  v_offers jsonb:='{}'::jsonb;
  v_offer jsonb:='{}'::jsonb;
  v_pending boolean:=false;
  v_rejected boolean:=false;
  v_is_complement boolean:=false;
  v_class jsonb:='{}'::jsonb;
  v_product_id uuid;
begin
  select * into v_policy from public.papoai_commercial_policy_config where id=1;
  select * into v_conv from public.conversations where id=p_conversation_id;

  if not found then
    return jsonb_build_object('level','none','reason','conversation_not_found');
  end if;

  v_human:=public.get_papoai_commerce_human_precedence_v1(p_conversation_id);
  v_journey:=public.get_papoai_sales_journey_v1(p_conversation_id);

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1;

  v_pending:=exists(
    select 1
    from public.papoai_commerce_pending_actions
    where conversation_id=p_conversation_id
      and status='pending'
      and expires_at>now()
  );

  v_rejected:=exists(
    select 1
    from public.sales_offer_events e
    where (
      e.conversation_id=p_conversation_id
      or (v_conv.customer_id is not null and e.customer_id=v_conv.customer_id)
    )
      and e.event_type in ('rejected','declined_all')
      and e.occurred_at>=now()-make_interval(days=>coalesce(v_policy.rejection_cooldown_days,7))
  );

  v_offers:=public.get_papoai_commerce_offers_v1(p_conversation_id,1);
  v_offer:=coalesce(v_offers->'items'->0,'{}'::jsonb);

  if coalesce(v_offer->>'product_id','')<>'' then
    v_product_id:=(v_offer->>'product_id')::uuid;
    select coalesce(is_upsell,false) into v_is_complement
    from public.products
    where id=v_product_id;
  end if;

  v_class:=public.classify_papoai_commercial_opportunity_v1(
    v_cart.id is not null,
    coalesce((v_human->>'human_active')::boolean,false),
    case when v_policy.suppress_when_pending_action then v_pending else false end,
    case
      when v_policy.suppress_during_checkout
        then coalesce(v_journey->>'stage','') in ('checkout','confirmation','completed')
             or coalesce(v_conv.fast_checkout,false)
      else false
    end,
    coalesce(v_conv.proactive_offer_count,0),
    coalesce(v_policy.max_proactive_offers_per_cart,1),
    case when v_policy.suppress_after_decline then v_rejected else false end,
    coalesce(v_offer->>'product_id','')<>'',
    coalesce((v_offer->>'bought_before')::boolean,false),
    coalesce((v_offer->>'score')::numeric,0),
    coalesce((v_offer->>'discount_percent')::numeric,0),
    coalesce((v_offer->>'discount_amount')::numeric,0),
    v_is_complement,
    v_policy.strong_min_personalized_score,
    v_policy.strong_min_discount_percent,
    v_policy.strong_min_discount_amount
  );

  return v_class||jsonb_build_object(
    'policy_enabled',v_policy.enabled,
    'journey_stage',v_journey->>'stage',
    'proactive_offer_count',coalesce(v_conv.proactive_offer_count,0),
    'max_proactive_offers_per_cart',v_policy.max_proactive_offers_per_cart,
    'recent_rejection',v_rejected,
    'candidate',case
      when coalesce(v_offer->>'product_id','')='' then null
      else jsonb_build_object(
        'product_id',v_offer->>'product_id',
        'name',v_offer->>'name',
        'commercial_price',v_offer->'commercial_price',
        'regular_price',v_offer->'regular_price',
        'discount_amount',v_offer->'discount_amount',
        'discount_percent',v_offer->'discount_percent',
        'reason',v_offer->>'reason',
        'bought_before',coalesce((v_offer->>'bought_before')::boolean,false),
        'score',coalesce((v_offer->>'score')::numeric,0),
        'is_complement',v_is_complement,
        'image_url',v_offer->>'image_url'
      )
    end
  );
end;
$$;

revoke all on function public.get_papoai_commercial_opportunity_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.get_papoai_commercial_opportunity_v1(uuid)
  to service_role;

create or replace function public.search_papoai_commerce_products_for_customer_v2(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 10,
  p_max_price numeric default null,
  p_preference text default 'best_match'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_base jsonb;
  v_items jsonb;
  v_ranked jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,10),12));
  v_pref text:=lower(trim(coalesce(p_preference,'best_match')));
begin
  if v_pref not in ('best_match','lowest_price','usual') then
    v_pref:='best_match';
  end if;

  v_base:=public.search_papoai_commerce_products_for_customer_v1(
    p_conversation_id,p_query,12
  );
  v_items:=coalesce(v_base->'items','[]'::jsonb);

  with x as (
    select
      item,
      coalesce((item->>'commercial_price')::numeric,999999) price,
      coalesce((item->>'personalized_score')::numeric,0) personalized_score,
      coalesce((item#>>'{personalization,frequent_bonus}')::numeric,0) frequent_bonus,
      coalesce((item->>'relevance_score')::numeric,0) relevance_score,
      lower(coalesce(item->>'name','')) name_norm
    from jsonb_array_elements(v_items) item
    where p_max_price is null
       or coalesce((item->>'commercial_price')::numeric,999999)<=p_max_price
  ), ranked as (
    select *
    from x
    order by
      case when v_pref='lowest_price' then price end asc nulls last,
      case when v_pref='usual' then frequent_bonus end desc nulls last,
      personalized_score desc,
      relevance_score desc,
      price asc,
      name_norm
    limit v_limit
  )
  select coalesce(jsonb_agg(
    item||jsonb_build_object(
      'budget_fit',p_max_price is null or price<=p_max_price,
      'ranking_preference',v_pref
    )
    order by
      case when v_pref='lowest_price' then price end asc nulls last,
      case when v_pref='usual' then frequent_bonus end desc nulls last,
      personalized_score desc,
      relevance_score desc,
      price asc,
      name_norm
  ),'[]'::jsonb)
  into v_ranked
  from ranked;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'count',jsonb_array_length(v_ranked),
    'items',v_ranked,
    'personalized',coalesce((v_base->>'personalized')::boolean,false),
    'max_price',p_max_price,
    'ranking_preference',v_pref,
    'customer_context',v_base->'customer_context'
  );
end;
$$;

revoke all on function public.search_papoai_commerce_products_for_customer_v2(uuid,text,integer,numeric,text)
  from public,anon,authenticated;
grant execute on function public.search_papoai_commerce_products_for_customer_v2(uuid,text,integer,numeric,text)
  to service_role;

update public.papoai_ai_tool_registry
set executor_target='search_papoai_commerce_products_for_customer_v2',
    input_schema='{
      "type":"object",
      "required":["query"],
      "properties":{
        "query":{"type":"string"},
        "limit":{"type":"integer","minimum":1,"maximum":12},
        "max_price":{"type":["number","null"],"minimum":0},
        "preference":{"type":"string","enum":["best_match","lowest_price","usual"]}
      },
      "additionalProperties":false
    }'::jsonb,
    metadata=metadata||jsonb_build_object(
      'supports_budget',true,
      'supports_price_priority',true,
      'supports_usual_product_priority',true
    ),
    updated_at=now()
where tool_key='search_products';

create or replace function public.resolve_papoai_governor_policy_v2(
  p_proposed_action text,
  p_clarification_count integer,
  p_delegated boolean,
  p_human_active boolean default false
)
returns jsonb
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_action text:=upper(trim(coalesce(p_proposed_action,'RESPOND')));
  v_reason text:='accepted';
begin
  if v_action not in ('RESPOND','ASK','RECOMMEND','ACT') then
    v_action:='RESPOND';
    v_reason:='invalid_action_normalized';
  end if;

  if coalesce(p_human_active,false) then
    return jsonb_build_object('action','ACT','reason','human_precedence','silent',true);
  end if;

  if v_action='ASK' and coalesce(p_delegated,false) then
    return jsonb_build_object(
      'action','RECOMMEND',
      'reason','delegation_prevents_reasking',
      'silent',false
    );
  end if;

  if v_action='ASK' and coalesce(p_clarification_count,0)>=2 then
    return jsonb_build_object(
      'action','RECOMMEND',
      'reason','clarification_limit_enforced',
      'silent',false
    );
  end if;

  return jsonb_build_object('action',v_action,'reason',v_reason,'silent',false);
end;
$$;

revoke all on function public.resolve_papoai_governor_policy_v2(text,integer,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.resolve_papoai_governor_policy_v2(text,integer,boolean,boolean)
  to service_role;

create or replace function public.record_papoai_conversation_governor_decision_v2(
  p_conversation_id uuid,
  p_topic_key text,
  p_intent text,
  p_proposed_action text,
  p_reason text,
  p_candidate_count integer default null,
  p_delegated boolean default false,
  p_question_key text default null,
  p_commercial_opportunity text default 'none',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_state jsonb;
  v_human jsonb;
  v_policy jsonb;
  v_action text;
  v_final_reason text;
begin
  v_state:=public.get_papoai_conversation_governor_state_v1(
    p_conversation_id,coalesce(p_topic_key,'')
  );
  v_human:=public.get_papoai_commerce_human_precedence_v1(p_conversation_id);
  v_policy:=public.resolve_papoai_governor_policy_v2(
    p_proposed_action,
    coalesce((v_state->>'clarification_count')::integer,0),
    p_delegated,
    coalesce((v_human->>'human_active')::boolean,false)
  );

  v_action:=v_policy->>'action';
  v_final_reason:=case
    when coalesce(v_policy->>'reason','accepted')='accepted'
      then p_reason
    else v_policy->>'reason'
  end;

  return public.record_papoai_conversation_governor_decision_v1(
    p_conversation_id,
    p_topic_key,
    p_intent,
    v_action,
    v_final_reason,
    p_candidate_count,
    p_delegated,
    case when v_action='ASK' then p_question_key else null end,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object(
      'proposed_action',upper(trim(coalesce(p_proposed_action,'RESPOND'))),
      'policy_action',v_action,
      'policy_reason',v_policy->>'reason',
      'commercial_opportunity',case
        when lower(coalesce(p_commercial_opportunity,'none')) in ('none','weak','strong')
          then lower(coalesce(p_commercial_opportunity,'none'))
        else 'none'
      end,
      'human_silent',coalesce((v_policy->>'silent')::boolean,false)
    )
  );
end;
$$;

revoke all on function public.record_papoai_conversation_governor_decision_v2(
  uuid,text,text,text,text,integer,boolean,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.record_papoai_conversation_governor_decision_v2(
  uuid,text,text,text,text,integer,boolean,text,text,jsonb
) to service_role;

create or replace function public.get_papoai_ai_context_pack_v2(
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
  v_base jsonb;
  v_commercial jsonb;
  v_journey jsonb;
  v_pending jsonb:='{}'::jsonb;
begin
  v_base:=public.get_papoai_ai_context_pack_v1(p_conversation_id,p_current_message);
  if not coalesce((v_base->>'ok')::boolean,false) then
    return v_base;
  end if;

  v_commercial:=public.get_papoai_commercial_opportunity_v1(p_conversation_id);
  v_journey:=public.get_papoai_sales_journey_v1(p_conversation_id);

  select coalesce(jsonb_build_object(
    'action_type',a.action_type,
    'expires_at',a.expires_at,
    'status',a.status
  ),'{}'::jsonb)
  into v_pending
  from public.papoai_commerce_pending_actions a
  where a.conversation_id=p_conversation_id
    and a.status='pending'
    and a.expires_at>now()
  order by a.created_at desc
  limit 1;

  return v_base
    ||jsonb_build_object(
      'schema_version','papoai-ai-context-v2',
      'journey',v_journey,
      'commercial',jsonb_build_object(
        'opportunity',coalesce(v_commercial->>'level','none'),
        'reason',v_commercial->>'reason',
        'candidate',v_commercial->'candidate',
        'proactive_offer_count',v_commercial->'proactive_offer_count',
        'max_proactive_offers_per_cart',v_commercial->'max_proactive_offers_per_cart',
        'recent_rejection',coalesce((v_commercial->>'recent_rejection')::boolean,false),
        'rules',jsonb_build_object(
          'weak_signal_must_not_interrupt',true,
          'strong_signal_may_offer_once',true,
          'resolve_primary_need_first',true,
          'decline_must_be_respected',true
        )
      ),
      'pending_action',v_pending
    );
end;
$$;

revoke all on function public.get_papoai_ai_context_pack_v2(uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_papoai_ai_context_pack_v2(uuid,text)
  to service_role;

create or replace function public.get_papoai_commerce_proactive_offer_v2(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_signal jsonb;
begin
  v_signal:=public.get_papoai_commercial_opportunity_v1(p_conversation_id);
  if coalesce(v_signal->>'level','none')<>'strong' then
    return jsonb_build_object(
      'eligible',false,
      'reason',coalesce(v_signal->>'reason','not_strong'),
      'commercial_opportunity',coalesce(v_signal->>'level','none'),
      'candidate',v_signal->'candidate'
    );
  end if;

  return jsonb_build_object(
    'eligible',true,
    'reason',v_signal->>'reason',
    'commercial_opportunity','strong',
    'offer',v_signal->'candidate',
    'writes_performed',false
  );
end;
$$;

revoke all on function public.get_papoai_commerce_proactive_offer_v2(uuid)
  from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_proactive_offer_v2(uuid)
  to service_role;

do $$
declare
  ddl text;
begin
  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='propose_papoai_commerce_proactive_offer_choice_v1';

  ddl:=replace(
    ddl,
    'v_proactive:=public.get_papoai_commerce_proactive_offer_v1(p_conversation_id);',
    'v_proactive:=public.get_papoai_commerce_proactive_offer_v2(p_conversation_id);'
  );
  execute ddl;
end $$;

do $$
declare
  ddl text;
begin
  select pg_get_functiondef(p.oid) into ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='execute_papoai_ai_tool_v1';

  ddl:=replace(
    ddl,
    'v_result:=public.search_papoai_commerce_products_for_customer_v1(
        p_conversation_id,
        v_args->>''query'',
        greatest(1,least(coalesce((v_args->>''limit'')::integer,3),12))
      );',
    'v_result:=public.search_papoai_commerce_products_for_customer_v2(
        p_conversation_id,
        v_args->>''query'',
        greatest(1,least(coalesce((v_args->>''limit'')::integer,3),12)),
        case when nullif(v_args->>''max_price'','''') is null then null else (v_args->>''max_price'')::numeric end,
        coalesce(nullif(v_args->>''preference'',''''),''best_match'')
      );'
  );
  execute ddl;
end $$;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'commercial_governor_version','v2',
  'commercial_opportunity_version','v1',
  'commercial_opportunity_levels',jsonb_build_array('none','weak','strong'),
  'product_personalization_version','v2',
  'ai_context_pack_version','v2',
  'offer_policy','server_signal_strong_only_for_proactive',
  'sales_philosophy','active_humanized_help_first',
  'r3_programming_status','in_progress'
),
updated_at=now()
where id=1;

commit;

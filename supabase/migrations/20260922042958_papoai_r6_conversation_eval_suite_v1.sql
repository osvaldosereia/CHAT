begin;
create table if not exists public.papoai_eval_scenarios (
  scenario_key text primary key,
  suite_version text not null default 'r6-v1',
  layer text not null check(layer in ('planner','deterministic','database','journey')),
  category text not null, persona text, title text not null, input_text text not null,
  context_pack jsonb not null default '{}'::jsonb,
  expectation jsonb not null default '{}'::jsonb,
  critical boolean not null default false, active boolean not null default true,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.papoai_eval_scenarios enable row level security;
revoke all on table public.papoai_eval_scenarios from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_eval_scenarios to service_role;

create table if not exists public.papoai_eval_runs (
  id uuid primary key default gen_random_uuid(), suite_version text not null,
  mode text not null check(mode in ('static','planner_live','database','journey','combined')),
  status text not null default 'running' check(status in ('running','passed','failed','partial')),
  model text, scenario_count integer not null default 0, passed_count integer not null default 0,
  failed_count integer not null default 0, critical_failed_count integer not null default 0,
  metrics jsonb not null default '{}'::jsonb, metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(), finished_at timestamptz
);
alter table public.papoai_eval_runs enable row level security;
revoke all on table public.papoai_eval_runs from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_eval_runs to service_role;
create index if not exists papoai_eval_runs_suite_started_idx on public.papoai_eval_runs(suite_version,started_at desc);

create table if not exists public.papoai_eval_results (
  id bigserial primary key, run_id uuid not null references public.papoai_eval_runs(id) on delete cascade,
  scenario_key text not null references public.papoai_eval_scenarios(scenario_key) on delete cascade,
  passed boolean not null, critical boolean not null default false,
  failures jsonb not null default '[]'::jsonb, actual jsonb not null default '{}'::jsonb,
  decision text, tool_keys text[] not null default '{}'::text[], latency_ms integer,
  input_tokens integer, cached_input_tokens integer, output_tokens integer,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.papoai_eval_results enable row level security;
revoke all on table public.papoai_eval_results from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_eval_results to service_role;
grant usage,select on sequence public.papoai_eval_results_id_seq to service_role;
create index if not exists papoai_eval_results_run_idx on public.papoai_eval_results(run_id,passed,critical);
create unique index if not exists papoai_eval_results_run_scenario_uq on public.papoai_eval_results(run_id,scenario_key);
create index if not exists papoai_eval_results_scenario_key_idx on public.papoai_eval_results(scenario_key);


CREATE OR REPLACE FUNCTION public.get_papoai_r6_eval_scenarios_v1(p_layer text DEFAULT 'planner'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'scenario_key',scenario_key,
    'layer',layer,
    'category',category,
    'persona',persona,
    'title',title,
    'input_text',input_text,
    'context_pack',context_pack,
    'expectation',expectation,
    'critical',critical
  ) order by scenario_key),'[]'::jsonb)
  from public.papoai_eval_scenarios
  where active=true
    and suite_version='r6-v1'
    and (p_layer is null or layer=p_layer);
$function$;
revoke all on function public.get_papoai_r6_eval_scenarios_v1(text) from public,anon,authenticated;
grant execute on function public.get_papoai_r6_eval_scenarios_v1(text) to service_role;

CREATE OR REPLACE FUNCTION public.get_papoai_r6_readiness_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_planner public.papoai_eval_runs%rowtype;
  v_static public.papoai_eval_runs%rowtype;
  v_journey public.papoai_eval_runs%rowtype;
  v_ai_enabled boolean:=false;
  v_policy_enabled boolean:=false;
  v_channel_enabled boolean:=false;
  v_runtime_tools integer:=0;
  v_ready boolean:=false;
begin
  select * into v_cfg
  from public.papoai_commerce_brain_config
  where id=1;

  select * into v_planner
  from public.papoai_eval_runs
  where suite_version='r6-v1'
    and mode='planner_live'
    and status='passed'
  order by finished_at desc nulls last,started_at desc
  limit 1;

  select * into v_static
  from public.papoai_eval_runs
  where suite_version='r6-v1'
    and mode='static'
    and status='passed'
  order by finished_at desc nulls last,started_at desc
  limit 1;

  select * into v_journey
  from public.papoai_eval_runs
  where suite_version='r6-v1'
    and mode='journey'
    and status='passed'
  order by finished_at desc nulls last,started_at desc
  limit 1;

  select coalesce(enabled,false) into v_ai_enabled
  from public.papoai_ai_runtime_config where id=1;
  select coalesce(enabled,false) into v_policy_enabled
  from public.papoai_commercial_policy_config where id=1;
  select coalesce(enabled,false) into v_channel_enabled
  from public.papoai_channel_runtime_config where id=1;
  select count(*)::integer into v_runtime_tools
  from public.papoai_ai_tool_registry where runtime_enabled;

  v_ready:=
    v_planner.id is not null
    and v_planner.scenario_count>=24
    and v_planner.failed_count=0
    and v_planner.critical_failed_count=0
    and coalesce((v_planner.metrics->>'pass_rate')::numeric,0)=1
    and coalesce((v_planner.metrics->>'tool_accuracy')::numeric,0)=1
    and coalesce((v_planner.metrics->>'unnecessary_ask_count')::integer,999)=0
    and coalesce((v_planner.metrics->>'commercial_hallucination_count')::integer,999)=0
    and v_static.id is not null
    and v_static.failed_count=0
    and v_journey.id is not null
    and v_journey.failed_count=0
    and coalesce(v_cfg.metadata->>'product_search_ranking_version','')='r6-tiered-v1'
    and coalesce(v_cfg.enabled,false)=false
    and coalesce(v_cfg.write_enabled,false)=false
    and coalesce(v_cfg.bling_queue_enabled,false)=false
    and not v_ai_enabled
    and not v_policy_enabled
    and not v_channel_enabled
    and v_runtime_tools=0;

  return jsonb_build_object(
    'ok',true,
    'round','R6',
    'programming_complete',v_ready,
    'ready_for_r7',v_ready,
    'production_ready',false,
    'search',jsonb_build_object(
      'ranking_version',v_cfg.metadata->>'product_search_ranking_version',
      'sellable_products',(
        select count(*)
        from public.products
        where is_active=true and physically_verified=true
          and coalesce(stock,0)>0 and coalesce(price,0)>0
      ),
      'active_baskets',(
        select count(*) from public.basket_templates where is_active=true
      ),
      'empty_active_baskets',(
        select count(*)
        from public.basket_templates bt
        where bt.is_active=true
          and not exists(
            select 1 from public.basket_template_items bi
            where bi.basket_id=bt.id and bi.quantity>0
          )
      )
    ),
    'planner_live',case when v_planner.id is null then jsonb_build_object('passed',false)
      else jsonb_build_object(
        'passed',v_planner.status='passed',
        'run_id',v_planner.id,
        'model',v_planner.model,
        'scenario_count',v_planner.scenario_count,
        'passed_count',v_planner.passed_count,
        'critical_failed_count',v_planner.critical_failed_count,
        'metrics',v_planner.metrics
      ) end,
    'deterministic',case when v_static.id is null then jsonb_build_object('passed',false)
      else jsonb_build_object(
        'passed',v_static.status='passed',
        'assertions',v_static.metrics->'assertions',
        'metrics',v_static.metrics
      ) end,
    'journey',case when v_journey.id is null then jsonb_build_object('passed',false)
      else jsonb_build_object(
        'passed',v_journey.status='passed',
        'metrics',v_journey.metrics
      ) end,
    'gates',jsonb_build_object(
      'commerce_enabled',coalesce(v_cfg.enabled,false),
      'write_enabled',coalesce(v_cfg.write_enabled,false),
      'bling_queue_enabled',coalesce(v_cfg.bling_queue_enabled,false),
      'ai_runtime_enabled',v_ai_enabled,
      'commercial_policy_enabled',v_policy_enabled,
      'channel_runtime_enabled',v_channel_enabled,
      'runtime_tools_enabled',v_runtime_tools
    ),
    'cost_telemetry',jsonb_build_object(
      'planner_input_tokens',coalesce((v_planner.metrics->>'input_tokens')::bigint,0),
      'planner_cached_input_tokens',coalesce((v_planner.metrics->>'cached_input_tokens')::bigint,0),
      'planner_output_tokens',coalesce((v_planner.metrics->>'output_tokens')::bigint,0),
      'estimated_cost_usd',v_planner.metrics->'estimated_cost_usd',
      'note',coalesce(v_planner.metrics->>'cost_note','No model price profile configured')
    ),
    'next_gate','R7_physical_PapoAI_Meta_homologation'
  );
end;
$function$;
revoke all on function public.get_papoai_r6_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_papoai_r6_readiness_v1() to service_role;

CREATE OR REPLACE FUNCTION public.refresh_papoai_eval_run_v1(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.papoai_eval_runs%rowtype;
  v_total integer:=0;
  v_passed integer:=0;
  v_failed integer:=0;
  v_critical_failed integer:=0;
  v_expected integer:=0;
  v_ask integer:=0;
  v_unnecessary_ask integer:=0;
  v_tool_expected integer:=0;
  v_tool_correct integer:=0;
  v_handoff_expected integer:=0;
  v_handoff_correct integer:=0;
  v_hallucination integer:=0;
  v_input bigint:=0;
  v_cached bigint:=0;
  v_output bigint:=0;
  v_avg_latency numeric:=0;
  v_p95_latency numeric:=0;
  v_metrics jsonb;
  v_pass_rate numeric:=0;
  v_tool_accuracy numeric:=1;
  v_status text;
begin
  select * into v_run
  from public.papoai_eval_runs
  where id=p_run_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'reason','run_not_found');
  end if;

  select count(*)::integer
  into v_expected
  from public.papoai_eval_scenarios
  where suite_version=v_run.suite_version
    and active=true
    and case when v_run.mode='planner_live' then layer='planner' else true end;

  select
    count(*)::integer,
    count(*) filter(where r.passed)::integer,
    count(*) filter(where not r.passed)::integer,
    count(*) filter(where not r.passed and r.critical)::integer,
    count(*) filter(where r.decision='ASK')::integer,
    count(*) filter(
      where r.decision='ASK'
        and coalesce((s.expectation->>'no_ask')::boolean,false)
    )::integer,
    count(*) filter(
      where jsonb_array_length(coalesce(s.expectation->'required_any_tools','[]'::jsonb))>0
    )::integer,
    count(*) filter(
      where jsonb_array_length(coalesce(s.expectation->'required_any_tools','[]'::jsonb))>0
        and coalesce((r.metadata->>'required_tool_satisfied')::boolean,false)
    )::integer,
    count(*) filter(
      where s.expectation ? 'should_handoff'
    )::integer,
    count(*) filter(
      where s.expectation ? 'should_handoff'
        and coalesce((r.metadata->>'handoff_satisfied')::boolean,false)
    )::integer,
    count(*) filter(
      where coalesce((r.metadata->>'commercial_hallucination')::boolean,false)
    )::integer,
    coalesce(sum(r.input_tokens),0)::bigint,
    coalesce(sum(r.cached_input_tokens),0)::bigint,
    coalesce(sum(r.output_tokens),0)::bigint,
    coalesce(avg(r.latency_ms),0)::numeric(12,2),
    coalesce(percentile_cont(0.95) within group(order by r.latency_ms),0)::numeric(12,2)
  into
    v_total,v_passed,v_failed,v_critical_failed,
    v_ask,v_unnecessary_ask,
    v_tool_expected,v_tool_correct,
    v_handoff_expected,v_handoff_correct,
    v_hallucination,
    v_input,v_cached,v_output,
    v_avg_latency,v_p95_latency
  from public.papoai_eval_results r
  join public.papoai_eval_scenarios s on s.scenario_key=r.scenario_key
  where r.run_id=p_run_id;

  v_pass_rate:=case when v_total>0 then v_passed::numeric/v_total else 0 end;
  v_tool_accuracy:=case when v_tool_expected>0 then v_tool_correct::numeric/v_tool_expected else 1 end;

  v_metrics:=jsonb_build_object(
    'expected_scenarios',v_expected,
    'evaluated_scenarios',v_total,
    'pass_rate',round(v_pass_rate,4),
    'ask_count',v_ask,
    'ask_rate',case when v_total>0 then round(v_ask::numeric/v_total,4) else 0 end,
    'unnecessary_ask_count',v_unnecessary_ask,
    'unnecessary_ask_rate',case when v_total>0 then round(v_unnecessary_ask::numeric/v_total,4) else 0 end,
    'tool_expected_count',v_tool_expected,
    'tool_correct_count',v_tool_correct,
    'tool_accuracy',round(v_tool_accuracy,4),
    'handoff_expected_count',v_handoff_expected,
    'handoff_correct_count',v_handoff_correct,
    'commercial_hallucination_count',v_hallucination,
    'avg_latency_ms',v_avg_latency,
    'p95_latency_ms',v_p95_latency,
    'input_tokens',v_input,
    'cached_input_tokens',v_cached,
    'output_tokens',v_output,
    'estimated_cost_usd',null,
    'cost_note','Token usage recorded; exact cost is calculated only when a model price profile is configured.'
  );

  v_status:=case
    when v_total<v_expected then 'partial'
    when v_critical_failed>0 then 'failed'
    when v_pass_rate<0.85 then 'failed'
    when v_tool_accuracy<0.85 then 'failed'
    when v_unnecessary_ask>0 then 'failed'
    when v_handoff_expected>0 and v_handoff_correct<v_handoff_expected then 'failed'
    when v_hallucination>0 then 'failed'
    else 'passed'
  end;

  update public.papoai_eval_runs
     set scenario_count=v_total,
         passed_count=v_passed,
         failed_count=v_failed,
         critical_failed_count=v_critical_failed,
         metrics=v_metrics,
         status=v_status,
         finished_at=case when v_total>=v_expected then now() else null end
   where id=p_run_id
   returning * into v_run;

  return jsonb_build_object(
    'ok',true,
    'run_id',v_run.id,
    'status',v_run.status,
    'scenario_count',v_run.scenario_count,
    'passed_count',v_run.passed_count,
    'failed_count',v_run.failed_count,
    'critical_failed_count',v_run.critical_failed_count,
    'metrics',v_run.metrics
  );
end;
$function$;
revoke all on function public.refresh_papoai_eval_run_v1(uuid) from public,anon,authenticated;
grant execute on function public.refresh_papoai_eval_run_v1(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.search_papoai_commerce_products_v1(p_query text, p_limit integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_limit integer;
  v_query_norm text;
  v_items jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.product_reads_enabled,false) then
    return jsonb_build_object('ok',false,'reason','product_reads_disabled','items','[]'::jsonb);
  end if;

  v_limit:=greatest(1,least(coalesce(p_limit,v_cfg.max_product_results,6),12));

  v_query_norm:=translate(lower(trim(coalesce(p_query,''))),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
  v_query_norm:=regexp_replace(v_query_norm,'[^a-z0-9]+',' ','g');
  v_query_norm:=regexp_replace(v_query_norm,'\s+',' ','g');
  v_query_norm:=trim(v_query_norm);

  -- Linguagem comum do cliente -> termos encontrados no catálogo.
  v_query_norm:=regexp_replace(v_query_norm,'\mcachorros?\M','caes','g');
  v_query_norm:=regexp_replace(v_query_norm,'\mcachorrinhas?\M','caes','g');
  v_query_norm:=regexp_replace(v_query_norm,'\mcachorrinhos?\M','caes','g');

  with tokens as (
    select token,ord
    from regexp_split_to_table(v_query_norm,'[[:space:]]+') with ordinality t(token,ord)
    where length(token)>=2
      and token not in ('de','da','do','das','dos','para','com','sem','um','uma','uns','umas','pra')
  ),
  token_stats as (
    select
      count(*)::integer total_tokens,
      (select token from tokens order by ord limit 1) anchor_token
    from tokens
  ),
  candidates as (
    select
      p.id,p.name,p.brand,p.category,p.subcategory,p.packaging,
      p.price,p.offer_price,p.is_offer,p.stock,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url,p.image_original_url) image_url,
      coalesce(k.enrichment_status,'pending_research') knowledge_status,
      translate(lower(coalesce(public.get_papoai_product_search_document_v1(p.id),'')),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') searchable,
      translate(lower(coalesce(p.name,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') name_norm,
      translate(lower(coalesce(p.brand,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') brand_norm,
      translate(lower(concat_ws(' ',p.name,p.brand,p.category,p.subcategory,p.packaging)),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') core_norm
    from public.products p
    left join public.product_sales_knowledge k on k.product_id=p.id
    where p.physically_verified=true
      and p.is_active=true
      and coalesce(p.stock,0)>0
      and coalesce(p.price,0)>0
  ),
  scored as (
    select
      c.*,
      coalesce((
        select count(*)::integer
        from tokens t
        where c.searchable ~ ('(^|[^a-z0-9])'||t.token||'([^a-z0-9]|$)')
      ),0) token_hits,
      coalesce((
        select count(*)::integer
        from tokens t
        where c.core_norm ~ ('(^|[^a-z0-9])'||t.token||'([^a-z0-9]|$)')
      ),0) core_token_hits,
      ts.total_tokens,
      ts.anchor_token,
      case
        when ts.anchor_token is null then false
        else c.core_norm ~ ('(^|[^a-z0-9])'||ts.anchor_token||'([^a-z0-9]|$)')
      end core_anchor_match,
      case
        when ts.anchor_token is null then false
        else c.searchable ~ ('(^|[^a-z0-9])'||ts.anchor_token||'([^a-z0-9]|$)')
      end knowledge_anchor_match,
      case
        when c.name_norm=v_query_norm then 5
        when c.name_norm like v_query_norm||'%' then 4
        when c.name_norm like '%'||v_query_norm||'%' then 3
        else 0
      end phrase_score,
      case
        when c.brand_norm<>'' and v_query_norm ~ ('(^|[^a-z0-9])'||c.brand_norm||'([^a-z0-9]|$)') then 1
        else 0
      end brand_requested,
      greatest(
        extensions.word_similarity(v_query_norm,c.name_norm),
        extensions.word_similarity(v_query_norm,c.core_norm)
      ) similarity_score
    from candidates c
    cross join token_stats ts
  ),
  eligible as (
    select s.*,
      case
        when phrase_score>0 then 0
        when total_tokens>0 and core_token_hits=total_tokens then 1
        when total_tokens>0 and token_hits=total_tokens then 2
        when core_anchor_match then 3
        when knowledge_anchor_match then 4
        else 5
      end match_tier,
      min(case
        when phrase_score>0 then 0
        when total_tokens>0 and core_token_hits=total_tokens then 1
        when total_tokens>0 and token_hits=total_tokens then 2
        when core_anchor_match then 3
        when knowledge_anchor_match then 4
        else 5
      end) over() best_tier
    from scored s
    where token_hits>0
       or similarity_score>=case when total_tokens<=1 then 0.68 else 0.60 end
  ),
  ranked as (
    select *,
      (
        phrase_score*1200
        + case when total_tokens>0 and token_hits=total_tokens then 900 else 0 end
        + case when total_tokens>0 and core_token_hits=total_tokens then 700 else 0 end
        + case when core_anchor_match then 240 else 0 end
        + brand_requested*450
        + token_hits*160
        + core_token_hits*100
        + round(similarity_score*100)
      )::numeric relevance_score,
      case
        when match_tier<=1 then 'catalog'
        when match_tier=2 then 'knowledge'
        when match_tier in (3,4) then 'partial'
        else 'fuzzy'
      end match_mode
    from eligible
    where match_tier=best_tier
    order by
      phrase_score desc,
      core_token_hits desc,
      token_hits desc,
      similarity_score desc,
      name
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',id,
    'name',name,
    'brand',brand,
    'category',category,
    'subcategory',subcategory,
    'packaging',packaging,
    'commercial_price',case
      when is_offer and coalesce(offer_price,0)>0 and offer_price<=price then offer_price
      else price
    end,
    'regular_price',price,
    'is_offer',coalesce(is_offer,false),
    'stock',stock,
    'image_url',image_url,
    'knowledge_status',knowledge_status,
    'match_mode',match_mode,
    'match_tier',match_tier,
    'token_hits',token_hits,
    'core_token_hits',core_token_hits,
    'total_tokens',total_tokens,
    'relevance_score',relevance_score
  ) order by relevance_score desc,core_token_hits desc,token_hits desc,name),'[]'::jsonb)
  into v_items
  from ranked;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'normalized_query',v_query_norm,
    'count',jsonb_array_length(v_items),
    'catalog_scope','active_verified_in_stock_priced',
    'ranking_version','r6-tiered-v1',
    'items',v_items
  );
end;
$function$;
revoke all on function public.search_papoai_commerce_products_v1(text,integer) from public,anon,authenticated;
grant execute on function public.search_papoai_commerce_products_v1(text,integer) to service_role;


insert into public.papoai_eval_scenarios(
 scenario_key,suite_version,layer,category,persona,title,input_text,context_pack,expectation,critical,active,notes
) values
(
  'P01_PRODUCT_NEED_SEMANTIC','r6-v1','planner','product_search','normal',
  'Produto por necessidade semântica','Quero um shampoo para cabelo crespo','{"cart":{"has_cart":false},"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND","RESPOND"],"required_any_tools":["search_products"],"forbid_proactive_offer":true}'::jsonb,
  true,true,'Deve buscar catálogo; nunca inventar produto diretamente. RESPOND com tool é aceito: a resposta é apenas pré-tool, sem dado comercial inventado.'
),
(
  'P02_PRODUCT_BUDGET','r6-v1','planner','product_search','normal',
  'Busca com teto de preço','Quero um shampoo para cachos até 20 reais','{"cart":{"has_cart":false},"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND"],"required_any_tools":["search_products"],"tool_argument_checks":[{"path":"max_price","value":20,"operator":"lte","tool_key":"search_products"}],"forbid_proactive_offer":true}'::jsonb,
  true,true,'Teto de preço precisa ir para a tool, não ser calculado pela IA.'
),
(
  'P03_DELEGATED_CHOICE','r6-v1','planner','humanized','indeciso',
  'Cliente delega escolha','Não sei, você decide qual detergente levar','{"cart":{"has_cart":false},"journey":{"stage":"selection"},"customer":{"known":false},"governor":{"delegated":true,"clarification_count":0},"commercial":{"opportunity":"weak"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND"],"required_any_tools":["search_products"],"forbid_proactive_offer":true}'::jsonb,
  true,true,'Delegação nunca deve gerar nova pergunta apenas para devolver a escolha.'
),
(
  'P04_USUAL_PRODUCT','r6-v1','planner','personalization','recorrente',
  'Produto habitual do cliente','Me manda o shampoo que eu costumo comprar','{"cart":{"has_cart":false},"journey":{"stage":"selection"},"customer":{"known":true,"has_purchase_history":true},"governor":{"clarification_count":0},"commercial":{"opportunity":"weak"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND"],"required_any_tools":["search_products","get_customer_context"],"forbid_proactive_offer":true}'::jsonb,
  true,true,'Pode consultar contexto e/ou buscar usando preferência habitual.'
),
(
  'P05_LITERAL_PRODUCT','r6-v1','planner','product_search','normal',
  'Busca literal direta','Tem óleo de soja?','{"cart":{"has_cart":false},"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND"],"required_any_tools":["search_products"],"forbid_proactive_offer":true}'::jsonb,
  true,true,null
),
(
  'P06_REPEAT_PURCHASE','r6-v1','planner','repurchase','recorrente',
  'Repetir compra anterior','Quero repetir minha última cesta','{"cart":{"has_cart":false},"journey":{"stage":"selection"},"customer":{"known":true,"has_purchase_history":true},"governor":{"clarification_count":0},"commercial":{"opportunity":"strong"}}'::jsonb,'{"no_ask":true,"max_tool_calls":2,"allowed_decisions":["ACT"],"required_any_tools":["repeat_last_purchase"]}'::jsonb,
  true,true,null
),
(
  'P07_EXPLICIT_OFFERS','r6-v1','planner','offers','normal',
  'Cliente pede ofertas','Quais ofertas tem hoje?','{"cart":{"has_cart":false},"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RESPOND"],"required_any_tools":["get_offers"],"forbid_proactive_offer":true}'::jsonb,
  true,true,'Oferta explícita é diferente de oferta proativa.'
),
(
  'P08_START_CHECKOUT','r6-v1','planner','checkout','normal',
  'Cliente quer finalizar','Quero fechar meu pedido','{"cart":{"total":149.9,"has_cart":true},"journey":{"stage":"checkout"},"customer":{"known":true},"governor":{"clarification_count":0},"commercial":{"opportunity":"strong"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT"],"required_any_tools":["get_checkout_next_step","preview_order"],"forbid_proactive_offer":true}'::jsonb,
  true,true,null
),
(
  'P09_PAYMENT_PIX','r6-v1','planner','checkout','normal',
  'Forma de pagamento','Pode ser Pix','{"cart":{"has_cart":true},"journey":{"stage":"checkout"},"customer":{"known":true},"governor":{"clarification_count":1},"commercial":{"opportunity":"strong"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT"],"required_any_tools":["set_payment_method"],"forbid_proactive_offer":true}'::jsonb,
  true,true,null
),
(
  'P10_FINAL_CONFIRMATION','r6-v1','planner','confirmation','normal',
  'Confirmação final','Confirmo','{"cart":{"has_cart":true},"journey":{"stage":"confirmation"},"governor":{"clarification_count":2},"commercial":{"opportunity":"strong"},"pending_action":{"action_type":"confirm_order","has_pending":true}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT"],"required_any_tools":["confirm_order"],"tool_argument_checks":[{"path":"confirm","value":true,"operator":"eq","tool_key":"confirm_order"}],"forbid_proactive_offer":true}'::jsonb,
  true,true,null
),
(
  'P11_HUMAN_REQUEST','r6-v1','planner','handoff','irritado',
  'Pedido explícito de humano','Quero falar com uma pessoa','{"journey":{"stage":"human"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"should_handoff":true,"allowed_decisions":["ACT"],"required_any_tools":["request_handoff"],"forbid_proactive_offer":true}'::jsonb,
  true,true,null
),
(
  'P12_QUESTION_CAP','r6-v1','planner','humanized','indeciso',
  'Limite de perguntas','Qualquer um tá bom','{"cart":{"has_cart":false},"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":2},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["RESPOND","RECOMMEND","ACT"],"forbid_proactive_offer":true}'::jsonb,
  true,true,'Mesmo se o modelo tentar perguntar, policy normalizer deve impedir a terceira ASK.'
),
(
  'P13_NO_OFFER_CHECKOUT','r6-v1','planner','offers','normal',
  'Oferta proativa suprimida no checkout','Vamos fechar','{"cart":{"has_cart":true},"journey":{"stage":"checkout"},"customer":{"known":true},"governor":{"clarification_count":0},"commercial":{"opportunity":"strong"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RESPOND","RECOMMEND"],"forbid_proactive_offer":true}'::jsonb,
  true,true,null
),
(
  'P14_TYPOS_PRODUCT','r6-v1','planner','product_search','baixa_familiaridade',
  'Erro de português em produto','tem papé igienico ai?','{"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND"],"required_any_tools":["search_products"],"forbid_proactive_offer":true}'::jsonb,
  false,true,'Avalia robustez do LLM para erro comum.'
),
(
  'P15_ELDERLY_BASKET','r6-v1','planner','baskets','idoso',
  'Pedido simples de cesta barata','Minha filha eu quero uma cesta boa pra 2 pessoa e barata','{"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"max_tool_calls":2,"allowed_decisions":["ACT","RECOMMEND","ASK"],"required_any_tools":["search_baskets"],"forbid_proactive_offer":true}'::jsonb,
  false,true,'Uma pergunta pode ser aceitável se realmente mudar a recomendação.'
),
(
  'P16_AUDIO_STYLE_LAUNDRY','r6-v1','planner','product_search','audio_transcrito',
  'Fala natural de áudio','Eu queria ver um sabão pra lavar roupa mas um mais barato','{"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND","RESPOND"],"required_any_tools":["search_products"],"forbid_proactive_offer":true}'::jsonb,
  false,true,null
),
(
  'P17_SENSITIVE_SKIN','r6-v1','planner','product_search','normal',
  'Produto por uso','Preciso de sabonete para pele sensível','{"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND","RESPOND"],"required_any_tools":["search_products"],"forbid_proactive_offer":true}'::jsonb,
  true,true,' RESPOND com tool é aceito: a resposta é apenas pré-tool, sem dado comercial inventado.'
),
(
  'P18_DELEGATED_REPLACEMENT','r6-v1','planner','personalization','indeciso',
  'Substituição delegada','Tira o arroz e você decide o que colocar no lugar','{"cart":{"has_cart":true},"journey":{"stage":"personalization"},"customer":{"known":true},"governor":{"delegated":true,"clarification_count":0},"commercial":{"opportunity":"weak"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND"],"required_any_tools":["recommend_replacement"],"forbid_proactive_offer":true}'::jsonb,
  true,true,null
),
(
  'P19_IRRITATED_HANDOFF','r6-v1','planner','handoff','irritado',
  'Cliente irritado pede humano','Isso tá demorando demais, quero falar com alguém','{"journey":{"stage":"human"},"customer":{"known":true},"governor":{"clarification_count":1},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"should_handoff":true,"allowed_decisions":["ACT"],"required_any_tools":["request_handoff"],"forbid_proactive_offer":true}'::jsonb,
  true,true,null
),
(
  'P20_CUSTOMER_HISTORY','r6-v1','planner','personalization','recorrente',
  'Consulta de histórico','O que eu costumo comprar?','{"journey":{"stage":"discovery"},"customer":{"known":true,"has_purchase_history":true},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RESPOND"],"required_any_tools":["get_customer_context"],"forbid_proactive_offer":true}'::jsonb,
  false,true,null
),
(
  'P21_CHANGE_MIND','r6-v1','planner','change_of_mind','normal',
  'Mudança de intenção com ação pendente','Não quero mais trocar o arroz, quero papel higiênico','{"cart":{"has_cart":true},"journey":{"stage":"selection"},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"},"pending_action":{"action_type":"replace_basket_item","has_pending":true}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND"],"required_any_tools":["search_products"],"forbid_proactive_offer":true}'::jsonb,
  false,true,'A Edge cancela ação incompatível antes da nova intenção; planner deve seguir a nova necessidade.'
),
(
  'P22_SHORT_MESSAGE_BASKET','r6-v1','planner','baskets','baixa_familiaridade',
  'Mensagem curta','cesta barata','{"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"max_tool_calls":2,"allowed_decisions":["ACT","RECOMMEND","ASK"],"required_any_tools":["search_baskets"],"forbid_proactive_offer":true}'::jsonb,
  false,true,null
),
(
  'P23_STRONG_OFFER_ALLOWED','r6-v1','planner','offers','recorrente',
  'Oportunidade forte fora do checkout','Pode adicionar o leite também','{"cart":{"has_cart":true},"journey":{"stage":"personalization"},"customer":{"known":true},"governor":{"clarification_count":0},"commercial":{"opportunity":"strong"}}'::jsonb,'{"no_ask":true,"allowed_decisions":["ACT","RECOMMEND"],"required_any_tools":["add_cart_item","search_products"],"proactive_offer_may_be_true":true}'::jsonb,
  false,true,'Não exige oferta, apenas permite fora das fases suprimidas.'
),
(
  'P24_GREETING_SIMPLE','r6-v1','planner','humanized','normal',
  'Saudação simples','Oi','{"cart":{"has_cart":false},"journey":{"stage":"discovery"},"customer":{"known":false},"governor":{"clarification_count":0},"commercial":{"opportunity":"none"}}'::jsonb,'{"no_ask":true,"max_tool_calls":1,"allowed_decisions":["RESPOND"],"forbid_proactive_offer":true}'::jsonb,
  false,true,null
)
on conflict(scenario_key) do update set
 suite_version=excluded.suite_version,layer=excluded.layer,category=excluded.category,
 persona=excluded.persona,title=excluded.title,input_text=excluded.input_text,
 context_pack=excluded.context_pack,expectation=excluded.expectation,critical=excluded.critical,
 active=excluded.active,notes=excluded.notes,updated_at=now();

update public.papoai_ai_tool_registry
set requires_confirmation=false,
 description='Prepara repetição da última compra com condições atuais; o pedido explícito de repetir já autoriza preparar a proposta, sem finalizar o pedido.',
 metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
   'proposal_only',true,'explicit_repeat_request_authorizes_prepare',true,'r6_tuned',true
 ),
 updated_at=now()
where tool_key='repeat_last_purchase';

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
 'product_search_ranking_version','r6-tiered-v1',
 'r6_suite_version','r6-v1',
 'r6_eval_mode','internal_lab_only',
 'r6_edge_version',40,
 'r6_production_activation_authorized',false
),updated_at=now()
where id=1;
commit;
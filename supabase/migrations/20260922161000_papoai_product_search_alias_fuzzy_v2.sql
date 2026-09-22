-- Conversational product search hardening for the PapoAI Commerce OS.
-- Supabase remains the canonical product catalog. The native PapoAI product catalog
-- is intentionally not used in the current phase.

create table if not exists public.papoai_product_search_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  canonical_query text not null,
  alias_kind text not null default 'synonym'
    check (alias_kind in ('synonym','popular_name','typo','phrase')),
  priority integer not null default 100,
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists papoai_product_search_aliases_alias_uq
  on public.papoai_product_search_aliases ((lower(trim(alias))));

alter table public.papoai_product_search_aliases enable row level security;
revoke all on public.papoai_product_search_aliases from anon, authenticated;
grant select on public.papoai_product_search_aliases to service_role;

insert into public.papoai_product_search_aliases(alias,canonical_query,alias_kind,priority,notes)
values
  ('miojo','lamen','popular_name',10,'Nome popular para macarrão lámen/instantâneo.'),
  ('macarrao instantaneo','lamen','phrase',10,'Vocabulário comum do cliente para lámen.'),
  ('macarrão instantâneo','lamen','phrase',10,'Vocabulário comum do cliente para lámen.'),
  ('bombril','esponja de aco','popular_name',20,'Marca usada coloquialmente como nome do produto; catálogo atual pode ter outra marca.'),
  ('palha de aco','esponja de aco','synonym',20,'Sinônimo comum.'),
  ('palha de aço','esponja de aco','synonym',20,'Sinônimo comum.'),
  ('aroz','arroz','typo',30,'Erro de digitação frequente.'),
  ('saboneti','sabonete','typo',30,'Erro de digitação frequente.'),
  ('shampu','shampoo','typo',30,'Grafia coloquial.'),
  ('shampo','shampoo','typo',30,'Erro de digitação frequente.'),
  ('detergenti','detergente','typo',30,'Erro de digitação frequente.'),
  ('amacinti','amaciante','typo',30,'Erro de digitação frequente.')
on conflict ((lower(trim(alias)))) do update
set canonical_query=excluded.canonical_query,
    alias_kind=excluded.alias_kind,
    priority=excluded.priority,
    enabled=true,
    notes=excluded.notes,
    updated_at=now();

create or replace function public.normalize_papoai_product_query_v2(p_query text)
returns text
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_norm text;
  v_alias record;
  v_alias_norm text;
  v_canonical_norm text;
begin
  v_norm:=translate(lower(trim(coalesce(p_query,''))),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
  v_norm:=regexp_replace(v_norm,'[^a-z0-9]+',' ','g');
  v_norm:=regexp_replace(v_norm,'\s+',' ','g');
  v_norm:=trim(v_norm);

  for v_alias in
    select alias,canonical_query
    from public.papoai_product_search_aliases
    where enabled=true
    order by priority asc, length(alias) desc
  loop
    v_alias_norm:=translate(lower(trim(v_alias.alias)),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    );
    v_alias_norm:=regexp_replace(v_alias_norm,'[^a-z0-9]+',' ','g');
    v_alias_norm:=regexp_replace(v_alias_norm,'\s+',' ','g');
    v_alias_norm:=trim(v_alias_norm);

    v_canonical_norm:=translate(lower(trim(v_alias.canonical_query)),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    );
    v_canonical_norm:=regexp_replace(v_canonical_norm,'[^a-z0-9]+',' ','g');
    v_canonical_norm:=regexp_replace(v_canonical_norm,'\s+',' ','g');
    v_canonical_norm:=trim(v_canonical_norm);

    if v_alias_norm<>'' and v_norm ~ ('(^|[[:space:]])'||v_alias_norm||'([[:space:]]|$)') then
      v_norm:=regexp_replace(
        v_norm,
        '(^|[[:space:]])'||v_alias_norm||'([[:space:]]|$)',
        '\1'||v_canonical_norm||'\2',
        'g'
      );
      v_norm:=trim(regexp_replace(v_norm,'\s+',' ','g'));
    end if;
  end loop;

  v_norm:=regexp_replace(v_norm,'\mcachorros?\M','caes','g');
  v_norm:=regexp_replace(v_norm,'\mcachorrinhas?\M','caes','g');
  v_norm:=regexp_replace(v_norm,'\mcachorrinhos?\M','caes','g');

  return trim(regexp_replace(v_norm,'\s+',' ','g'));
end;
$function$;

revoke all on function public.normalize_papoai_product_query_v2(text) from public, anon, authenticated;
grant execute on function public.normalize_papoai_product_query_v2(text) to service_role;

create or replace function public.search_papoai_commerce_products_v1(
  p_query text,
  p_limit integer default null::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
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

  v_limit:=greatest(1,least(coalesce(p_limit,v_cfg.max_product_results,6),20));
  v_query_norm:=public.normalize_papoai_product_query_v2(p_query);

  with tokens as (
    select token,ord
    from regexp_split_to_table(v_query_norm,'[[:space:]]+') with ordinality t(token,ord)
    where length(token)>=2
      and token not in (
        'de','da','do','das','dos','para','com','sem','um','uma','uns','umas','pra',
        'qual','quais','que','voce','voces','tem','têm','vende','vendem','me','mostra','mostrar',
        'lista','listar','todos','todas','quero','queria','preciso','procuro','procura',
        'valor','preco','precos','quanto','ai','aqui','por','favor'
      )
  ),
  token_stats as (
    select
      count(*)::integer total_tokens,
      (select token from tokens order by ord limit 1) anchor_token,
      max(length(token))::integer longest_token
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
      translate(lower(coalesce(p.category,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') category_norm,
      translate(lower(coalesce(p.subcategory,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') subcategory_norm,
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
      ts.longest_token,
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
        when c.subcategory_norm=v_query_norm then 2
        when c.category_norm=v_query_norm then 1
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
       or similarity_score>=case
          when total_tokens<=1 and coalesce(longest_token,0)>=6 then 0.55
          when total_tokens<=1 and coalesce(longest_token,0)>=4 then 0.50
          when total_tokens<=1 then 0.68
          else 0.60
       end
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
    order by phrase_score desc,core_token_hits desc,token_hits desc,similarity_score desc,name
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
    'ranking_version','r6-tiered-v2-alias-fuzzy',
    'items',v_items
  );
end;
$function$;

update public.papoai_commerce_brain_config
set metadata =
  coalesce(metadata,'{}'::jsonb)
  || jsonb_build_object(
    'product_search_ranking_version','r6-tiered-v2-alias-fuzzy',
    'product_search_alias_registry',true,
    'product_search_typo_tolerance','bounded_single_token',
    'papoai_native_product_catalog_policy','not_used_current_phase',
    'canonical_product_catalog','supabase',
    'catalog_architecture_note','PapoAI is channel/provider; Supabase remains product source of truth'
  ),
  updated_at=now()
where id=1;

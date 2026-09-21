create or replace function public.search_catalog_products_v1(
  p_organization_id uuid,
  p_query text,
  p_limit integer default 12
)
returns table (
  id uuid,
  name text,
  sale_price_cents integer,
  image_url text,
  stock_quantity numeric,
  search_rank numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  q text;
  lim integer;
begin
  q := trim(regexp_replace(
    extensions.unaccent(lower(coalesce(p_query,''))),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));

  if length(q) < 2 then
    return;
  end if;

  lim := greatest(1, least(coalesce(p_limit,12),50));

  return query
  select
    p.id,
    p.name,
    p.sale_price_cents,
    p.image_url,
    p.stock_quantity,
    (
      case
        when p.search_text = q then 100
        when p.search_text like q || '%' then 70
        when p.search_text like '%' || q || '%' then 50
        else 0
      end
      + round((extensions.word_similarity(q,p.search_text) * 40)::numeric,4)
      + round((extensions.similarity(q,left(p.search_text,greatest(length(q),1)+40)) * 10)::numeric,4)
    )::numeric as search_rank
  from products p
  where p.organization_id = p_organization_id
    and p.active = true
    and (
      p.search_text like '%' || q || '%'
      or extensions.word_similarity(q,p.search_text) >= 0.28
    )
  order by search_rank desc, p.name
  limit lim;
end;
$function$;

revoke all on function public.search_catalog_products_v1(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.search_catalog_products_v1(uuid,text,integer)
  to service_role;

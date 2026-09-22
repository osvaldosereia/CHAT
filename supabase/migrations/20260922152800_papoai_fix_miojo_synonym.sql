
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='search_papoai_commerce_products_v1'
  limit 1;

  if position('v_query_norm:=replace(v_query_norm,''miojo'',''lamen'');' in v_def)=0 then
    v_def:=replace(
      v_def,
      '-- Linguagem comum do cliente -> termos encontrados no catálogo.',
      E'v_query_norm:=replace(v_query_norm,''miojo'',''lamen'');\n\n  -- Linguagem comum do cliente -> termos encontrados no catálogo.'
    );
    execute v_def;
  end if;
end $$;

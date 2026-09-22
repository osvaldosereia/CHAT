
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='search_papoai_commerce_products_v1'
  limit 1;

  v_def:=replace(
    v_def,
    $old$token not in ('de','da','do','das','dos','para','com','sem','um','uma','uns','umas','pra')$old$,
    $new$token not in (
      'de','da','do','das','dos','para','com','sem','um','uma','uns','umas','pra',
      'qual','quais','que','voce','voces','tem','têm','vende','vendem','me','mostra','mostrar',
      'lista','listar','todos','todas','quero','queria','preciso','procuro','procura',
      'valor','preco','precos','quanto','ai','aqui'
    )$new$
  );
  execute v_def;
end $$;

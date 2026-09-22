
begin;

do $$
declare
  r record;
  ddl text;
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'search_whatsapp_sellable_products_v1',
        'search_whatsapp_sellable_products_v2',
        'search_whatsapp_sellable_products_agent_v1',
        'get_papoai_commerce_offers_v1',
        'set_papoai_commerce_addon_quantity_v1',
        'replace_papoai_commerce_basket_item_v1',
        'replace_papoai_commerce_basket_item_v2',
        'resolve_papoai_commerce_replacement_candidates_v1',
        'preview_papoai_commerce_delegated_replacement_v1',
        'preview_papoai_commerce_delegated_replacement_v2',
        'preview_papoai_commerce_delegated_replacement_v3',
        'preview_papoai_commerce_repeat_last_purchase_v1',
        'apply_papoai_commerce_repeat_last_purchase_v1',
        'get_papoai_commerce_readiness_v1'
      )
  loop
    ddl:=pg_get_functiondef(r.oid);

    ddl:=replace(ddl,' and p.is_whatsapp_active=true','');
    ddl:=replace(ddl,' and p.is_whatsapp_active = true','');
    ddl:=replace(ddl,E'\n    and p.is_whatsapp_active=true','');
    ddl:=replace(ddl,E'\n      and p.is_whatsapp_active=true','');
    ddl:=replace(ddl,E'\n         and p.is_whatsapp_active=true','');

    ddl:=replace(ddl,' and is_whatsapp_active=true','');
    ddl:=replace(ddl,' and is_whatsapp_active = true','');
    ddl:=replace(ddl,E'\n        and is_whatsapp_active=true','');
    ddl:=replace(ddl,E'\n         and is_whatsapp_active=true','');

    ddl:=replace(ddl,'p.physically_verified,p.is_active,p.is_whatsapp_active,','p.physically_verified,p.is_active,');
    ddl:=replace(ddl,'p.physically_verified,p.is_active,p.is_whatsapp_active','p.physically_verified,p.is_active');
    ddl:=replace(ddl,E'\n       or v_row.is_whatsapp_active is not true','');

    ddl:=replace(
      ddl,
      'is_active and is_whatsapp_active and physically_verified',
      'is_active and physically_verified'
    );

    ddl:=replace(
      ddl,
      'p.physically_verified=true and p.is_active=true and p.is_whatsapp_active=true',
      'p.physically_verified=true and p.is_active=true'
    );

    ddl:=replace(ddl,'p.price is not null and p.price>=0','coalesce(p.price,0)>0');
    ddl:=replace(ddl,'p.price is not null and p.price >= 0','coalesce(p.price,0)>0');

    execute ddl;
  end loop;
end $$;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'sellable_product_rule','is_active+physically_verified+stock_positive+price_positive',
  'legacy_is_whatsapp_active_removed_from_product_tools',true,
  'legacy_product_filter_alignment_at',now()
),
updated_at=now()
where id=1;

commit;

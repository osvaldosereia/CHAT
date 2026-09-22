-- R4 smoke tests — channel capability adapter

do $$
declare
  cfg jsonb;
  ready jsonb;
  r jsonb;
begin
  cfg:=public.get_papoai_channel_runtime_config_v1();
  if coalesce((cfg->>'enabled')::boolean,true) then
    raise exception 'R4 channel runtime must remain disabled';
  end if;

  if coalesce((cfg->>'allowed_media_host_count')::integer,-1)<>0 then
    raise exception 'R4 media host allowlist must remain empty before physical homologation';
  end if;

  ready:=public.get_papoai_channel_readiness_v1();
  if coalesce((ready->>'text_ready')::boolean,false) is not true then
    raise exception 'R4 verified text capability missing';
  end if;

  r:=public.resolve_papoai_channel_delivery_v1(
    'image_caption',
    jsonb_build_object('text','produto','media_url','https://example.com/a.webp')
  );
  if r->>'resolved_type'<>'text'
     or coalesce((r->>'fallback_used')::boolean,false) is not true then
    raise exception 'R4 image must fall back until verified/enabled: %',r;
  end if;

  r:=public.resolve_papoai_channel_delivery_v1(
    'buttons',
    jsonb_build_object('text','confirma?')
  );
  if r->>'resolved_type'<>'numbered_text' then
    raise exception 'R4 buttons fallback invalid: %',r;
  end if;

  r:=public.resolve_papoai_channel_delivery_v1('list','{}'::jsonb);
  if r->>'resolved_type'<>'numbered_text' then
    raise exception 'R4 list fallback invalid: %',r;
  end if;

  r:=public.resolve_papoai_channel_delivery_v1('flow','{}'::jsonb);
  if r->>'resolved_type'<>'progressive_chat' then
    raise exception 'R4 flow fallback invalid: %',r;
  end if;

  r:=public.resolve_papoai_channel_delivery_v1('typing','{}'::jsonb);
  if r->>'resolved_type'<>'no_op' then
    raise exception 'R4 typing fallback invalid: %',r;
  end if;

  if (select enabled from public.papoai_ai_runtime_config where id=1) then
    raise exception 'AI runtime must remain disabled after R4';
  end if;

  if (select count(*) from public.papoai_ai_tool_registry where runtime_enabled)>0 then
    raise exception 'No AI tool may be runtime enabled after R4';
  end if;
end $$;

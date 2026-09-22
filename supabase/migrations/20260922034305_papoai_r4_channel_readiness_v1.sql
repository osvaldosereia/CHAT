
begin;

create or replace function public.get_papoai_channel_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_channel_runtime_config%rowtype;
  v_matrix jsonb:=public.get_papoai_channel_capability_matrix_v1();
  v_caps jsonb:=coalesce(v_matrix->'capabilities','{}'::jsonb);
begin
  select * into v_cfg from public.papoai_channel_runtime_config where id=1;

  return jsonb_build_object(
    'ok',true,
    'runtime_enabled',coalesce(v_cfg.enabled,false),
    'text_ready',coalesce((v_caps#>>'{text,verified}')::boolean,false),
    'image',jsonb_build_object(
      'state',v_caps#>>'{image,state}',
      'verified',coalesce((v_caps#>>'{image,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.outbound_image_enabled,false),
      'ready',coalesce((v_caps#>>'{image,verified}')::boolean,false)
              and coalesce(v_cfg.outbound_image_enabled,false)
    ),
    'inbound_audio',jsonb_build_object(
      'state',v_caps#>>'{inbound_audio,state}',
      'verified',coalesce((v_caps#>>'{inbound_audio,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.inbound_audio_enabled,false),
      'allowed_media_host_count',coalesce(cardinality(v_cfg.allowed_media_hosts),0),
      'ready',coalesce((v_caps#>>'{inbound_audio,verified}')::boolean,false)
              and coalesce(v_cfg.inbound_audio_enabled,false)
              and coalesce(cardinality(v_cfg.allowed_media_hosts),0)>0
    ),
    'inbound_image',jsonb_build_object(
      'state',v_caps#>>'{inbound_image,state}',
      'verified',coalesce((v_caps#>>'{inbound_image,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.inbound_image_enabled,false),
      'allowed_media_host_count',coalesce(cardinality(v_cfg.allowed_media_hosts),0),
      'ready',coalesce((v_caps#>>'{inbound_image,verified}')::boolean,false)
              and coalesce(v_cfg.inbound_image_enabled,false)
              and coalesce(cardinality(v_cfg.allowed_media_hosts),0)>0
    ),
    'voice',jsonb_build_object(
      'state',v_caps#>>'{voice,state}',
      'verified',coalesce((v_caps#>>'{voice,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.outbound_voice_enabled,false),
      'ready',coalesce((v_caps#>>'{voice,verified}')::boolean,false)
              and coalesce(v_cfg.outbound_voice_enabled,false)
    ),
    'buttons',jsonb_build_object(
      'state',v_caps#>>'{buttons,state}',
      'verified',coalesce((v_caps#>>'{buttons,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.interactive_enabled,false),
      'fallback','numbered_text'
    ),
    'list',jsonb_build_object(
      'state',v_caps#>>'{list,state}',
      'verified',coalesce((v_caps#>>'{list,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.interactive_enabled,false),
      'fallback','numbered_text'
    ),
    'flow',jsonb_build_object(
      'state',v_caps#>>'{flow,state}',
      'verified',coalesce((v_caps#>>'{flow,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.flow_enabled,false),
      'fallback','progressive_chat'
    ),
    'typing',jsonb_build_object(
      'state',v_caps#>>'{typing,state}',
      'verified',coalesce((v_caps#>>'{typing,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.typing_enabled,false),
      'fallback','no_op'
    ),
    'read_receipt',jsonb_build_object(
      'state',v_caps#>>'{read_receipt,state}',
      'verified',coalesce((v_caps#>>'{read_receipt,verified}')::boolean,false),
      'feature_enabled',coalesce(v_cfg.read_receipt_enabled,false),
      'fallback','no_op'
    ),
    'handoff',jsonb_build_object(
      'state',v_caps#>>'{handoff,state}',
      'verified',coalesce((v_caps#>>'{handoff,verified}')::boolean,false)
    ),
    'silent',jsonb_build_object(
      'state',v_caps#>>'{silent,state}',
      'verified',coalesce((v_caps#>>'{silent,verified}')::boolean,false)
    ),
    'media_models',jsonb_build_object(
      'transcription',v_cfg.transcription_model,
      'vision',v_cfg.vision_model,
      'vision_detail',v_cfg.vision_detail,
      'tts',v_cfg.tts_model,
      'tts_voice',v_cfg.tts_voice
    ),
    'production_activation_authorized',false,
    'next_gate','physical_papoai_meta_homologation_r7'
  );
end;
$$;

revoke all on function public.get_papoai_channel_readiness_v1()
  from public,anon,authenticated;
grant execute on function public.get_papoai_channel_readiness_v1()
  to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'channel_readiness_version','v1',
  'channel_interactive_policy','verified_shape_or_text_fallback',
  'media_security_policy','https_plus_verified_host_allowlist',
  'voice_response_policy','customer_audio_or_explicit_preference_only',
  'meta_native_supported_reference',jsonb_build_object(
    'image',true,
    'audio_voice',true,
    'reply_buttons',true,
    'lists',true,
    'flows',true,
    'typing_read_receipt',true
  )
),
updated_at=now()
where id=1;

commit;

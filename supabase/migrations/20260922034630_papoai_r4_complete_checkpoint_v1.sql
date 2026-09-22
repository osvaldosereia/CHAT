
    begin;

    create index if not exists papoai_media_processing_runs_message_id_idx
      on public.papoai_media_processing_runs(message_id)
      where message_id is not null;

    update public.papoai_channel_runtime_config
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'r4_programming_status','complete',
      'r4_completed_at',now(),
      'edge_version',35,
      'tts_retention_hours',24,
      'physical_homologation_required',true,
      'interactive_shape_policy','do_not_emit_unverified_provider_shapes'
    ),
    updated_at=now()
    where id=1;

    update public.papoai_commerce_brain_config
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'r4_programming_status','complete',
      'r4_completed_at',now(),
      'channel_edge_version',35,
      'inbound_media_policy','normalize_then_process_only_when_verified_and_enabled',
      'outbound_media_policy','capability_resolution_with_text_fallback',
      'signed_media_url_persistence',false,
      'physical_channel_homologation_pending',true
    ),
    updated_at=now()
    where id=1;

    commit;
  
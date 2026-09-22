
begin;

update public.papoai_channel_runtime_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'r7_programming_status','complete_awaiting_physical',
  'r7_edge_version',41,
  'r7_dual_key_auth_verified',true,
  'r7_invalid_key_rejected',true,
  'r7_homologation_transaction_tested',true,
  'r7_programming_completed_at',now(),
  'r7_rls_policy','service_role_only_no_user_policy',
  'production_activation_authorized',false
),
updated_at=now()
where id=1;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'r7_programming_status','complete_awaiting_physical',
  'r7_edge_version',41,
  'r7_ready_for_physical_homologation',true,
  'r7_dual_key_rotation_staged',true,
  'r7_production_activation_authorized',false
),
updated_at=now()
where id=1;

commit;

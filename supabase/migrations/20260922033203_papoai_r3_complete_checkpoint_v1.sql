
begin;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'r3_programming_status','complete',
  'r3_completed_at',now(),
  'commercial_seller_behavior','humanized_active_contextual',
  'commercial_opportunity_policy','none_weak_strong',
  'delegation_policy','recommend_never_reask',
  'question_limit_policy','max_2_per_topic',
  'change_of_mind_policy','supersede_incompatible_pending_action',
  'offer_rejection_policy','record_and_cooldown',
  'budget_search_policy','max_price_plus_ranking_preference',
  'proactive_offer_requires_policy_enabled',true
),
updated_at=now()
where id=1;

commit;

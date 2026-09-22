-- R2A smoke tests — PapoAI AI Context Pack v1
select (public.get_papoai_ai_runtime_config_v1()->>'enabled')::boolean as ai_runtime_enabled;

select count(*) as total_tools,
       count(*) filter(where implementation_status='ready') as ready_tools,
       count(*) filter(where runtime_enabled) as runtime_enabled
from public.papoai_ai_tool_registry;

with sample as (
  select conversation_id
  from public.messages
  where coalesce(nullif(trim(transcript),''),nullif(trim(body_text),'')) is not null
  group by conversation_id
  order by max(created_at) desc
  limit 20
)
select
  conversation_id,
  (p#>>'{context_budget,bytes}')::integer as bytes,
  (p#>>'{context_budget,limit_bytes}')::integer as limit_bytes,
  (p#>>'{context_budget,within_budget}')::boolean as within_budget,
  jsonb_array_length(coalesce(p->'recent_messages','[]'::jsonb)) as recent_messages,
  (p#>'{customer_summary}' ? 'customer_id') as leaks_customer_id,
  (p#>'{checkout}' ? 'address') as leaks_full_address,
  (p#>'{conversation}' ? 'wa_contact_e164') as leaks_phone
from sample
cross join lateral public.get_papoai_ai_context_pack_v1(conversation_id,'smoke test') p;

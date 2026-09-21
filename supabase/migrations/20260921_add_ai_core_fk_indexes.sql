create index if not exists ai_prompt_versions_organization_idx
  on ai_prompt_versions(organization_id);

create index if not exists ai_runs_agent_idx
  on ai_runs(agent_id)
  where agent_id is not null;

create index if not exists ai_runs_organization_idx
  on ai_runs(organization_id,created_at desc);

create index if not exists ai_tool_calls_conversation_idx
  on ai_tool_calls(conversation_id,created_at desc)
  where conversation_id is not null;

create index if not exists ai_tool_calls_organization_idx
  on ai_tool_calls(organization_id,created_at desc);

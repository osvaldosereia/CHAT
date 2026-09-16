export type AutomationMode = 'ai' | 'human' | 'paused';

export interface ConversationControlRecord {
  id: string;
  activeProjectId: string | null;
  automationMode: AutomationMode;
  needsAttention: boolean;
  attentionReason: string | null;
}

export interface ConversationControlStore {
  updateAutomationMode(
    conversationId: string,
    mode: AutomationMode,
  ): Promise<ConversationControlRecord>;
  updateAttention(
    conversationId: string,
    needsAttention: boolean,
    reason: string | null,
  ): Promise<ConversationControlRecord>;
}

export function setConversationAutomationMode(
  store: ConversationControlStore,
  conversationId: string,
  mode: AutomationMode,
): Promise<ConversationControlRecord> {
  return store.updateAutomationMode(conversationId, mode);
}

export function markConversationAttention(
  store: ConversationControlStore,
  conversationId: string,
  reason: string | null,
): Promise<ConversationControlRecord> {
  const normalizedReason = reason?.trim() || null;
  return store.updateAttention(
    conversationId,
    normalizedReason !== null,
    normalizedReason,
  );
}

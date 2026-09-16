export type ConversationStatus = 'open' | 'closed';
export type AutomationMode = 'ai' | 'human' | 'paused';

export interface ConversationRecord {
  id: string;
  customerId: string;
  status: ConversationStatus;
  activeProjectId: string | null;
  automationMode: AutomationMode;
  needsAttention: boolean;
  attentionReason: string | null;
}

export interface ConversationStore {
  findOpenByCustomerId(customerId: string): Promise<ConversationRecord | null>;
  create(input: {
    customerId: string;
    channel: 'whatsapp';
    automationMode: AutomationMode;
  }): Promise<ConversationRecord>;
}

export function canAiReply(conversation: ConversationRecord): boolean {
  return (
    conversation.status === 'open' &&
    conversation.automationMode === 'ai' &&
    !conversation.needsAttention
  );
}

export async function findOrCreateConversation(
  store: ConversationStore,
  customerId: string,
): Promise<ConversationRecord> {
  const existing = await store.findOpenByCustomerId(customerId);

  if (existing) {
    return existing;
  }

  return store.create({
    customerId,
    channel: 'whatsapp',
    automationMode: 'ai',
  });
}

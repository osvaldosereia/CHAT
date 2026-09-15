export type ConversationStatus = 'open' | 'closed';

export interface ConversationRecord {
  id: string;
  customerId: string;
  status: ConversationStatus;
  activeProjectId: string | null;
}

export interface ConversationStore {
  findOpenByCustomerId(customerId: string): Promise<ConversationRecord | null>;
  create(input: { customerId: string; channel: 'whatsapp' }): Promise<ConversationRecord>;
}

export async function findOrCreateConversation(
  store: ConversationStore,
  customerId: string,
): Promise<ConversationRecord> {
  const existing = await store.findOpenByCustomerId(customerId);

  if (existing) {
    return existing;
  }

  return store.create({ customerId, channel: 'whatsapp' });
}

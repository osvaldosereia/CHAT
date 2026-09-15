import { describe, expect, it, vi } from 'vitest';
import { findOrCreateConversation, type ConversationRecord, type ConversationStore } from './conversation';

const openConversation: ConversationRecord = {
  id: 'conversation-1',
  customerId: 'customer-1',
  status: 'open',
  activeProjectId: null,
};

describe('findOrCreateConversation', () => {
  it('reutiliza a conversa aberta do cliente', async () => {
    const store: ConversationStore = {
      findOpenByCustomerId: vi.fn().mockResolvedValue(openConversation),
      create: vi.fn(),
    };

    const result = await findOrCreateConversation(store, 'customer-1');

    expect(result).toEqual(openConversation);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('cria nova conversa quando nao existe uma aberta', async () => {
    const created = { ...openConversation, id: 'conversation-2' };
    const store: ConversationStore = {
      findOpenByCustomerId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
    };

    const result = await findOrCreateConversation(store, 'customer-1');

    expect(result).toEqual(created);
    expect(store.create).toHaveBeenCalledWith({ customerId: 'customer-1', channel: 'whatsapp' });
  });
});

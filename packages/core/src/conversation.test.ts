import { describe, expect, it, vi } from 'vitest';
import {
  canAiReply,
  findOrCreateConversation,
  type ConversationRecord,
  type ConversationStore,
} from './conversation';

const openConversation: ConversationRecord = {
  id: 'conversation-1',
  customerId: 'customer-1',
  status: 'open',
  activeProjectId: null,
  automationMode: 'ai',
  needsAttention: false,
  attentionReason: null,
};

describe('canAiReply', () => {
  it('permite IA somente em conversa aberta, modo ai e sem alerta', () => {
    expect(canAiReply(openConversation)).toBe(true);
    expect(canAiReply({ ...openConversation, automationMode: 'human' })).toBe(false);
    expect(canAiReply({ ...openConversation, automationMode: 'paused' })).toBe(false);
    expect(canAiReply({ ...openConversation, status: 'closed' })).toBe(false);
    expect(
      canAiReply({
        ...openConversation,
        needsAttention: true,
        attentionReason: 'Cliente pediu atendente humano',
      }),
    ).toBe(false);
  });
});

describe('findOrCreateConversation', () => {
  it('reutiliza a conversa aberta do cliente sem alterar o controle atual', async () => {
    const humanOwned = { ...openConversation, automationMode: 'human' as const };
    const store: ConversationStore = {
      findOpenByCustomerId: vi.fn().mockResolvedValue(humanOwned),
      create: vi.fn(),
    };

    const result = await findOrCreateConversation(store, 'customer-1');

    expect(result).toEqual(humanOwned);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('cria nova conversa em modo IA quando nao existe uma aberta', async () => {
    const created = { ...openConversation, id: 'conversation-2' };
    const store: ConversationStore = {
      findOpenByCustomerId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
    };

    const result = await findOrCreateConversation(store, 'customer-1');

    expect(result).toEqual(created);
    expect(store.create).toHaveBeenCalledWith({
      customerId: 'customer-1',
      channel: 'whatsapp',
      automationMode: 'ai',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  processInboundMessage,
  type InboundMessageStore,
} from './ingest';
import type { NormalizedInboundMessage } from './normalize-event';

const message: NormalizedInboundMessage = {
  messageId: 'wamid.duplicate-1',
  phone: '5565999999999',
  customerName: 'Ana Souza',
  type: 'text',
  text: 'Quero uma caneca',
  mediaId: null,
  timestamp: '1789470000',
  rawPayload: { id: 'wamid.duplicate-1' },
};

describe('processInboundMessage', () => {
  it('não dispara processamento duplicado quando o mesmo wamid chega novamente', async () => {
    const stored: string[] = [];
    const seen = new Set<string>();
    const store: InboundMessageStore = {
      claim: vi.fn(async (incoming) => {
        if (seen.has(incoming.messageId)) {
          return {
            accepted: false,
            messageId: 'stored-message-1',
            customerId: 'customer-1',
            conversationId: 'conversation-1',
          };
        }

        seen.add(incoming.messageId);
        stored.push(incoming.messageId);
        return {
          accepted: true,
          messageId: 'stored-message-1',
          customerId: 'customer-1',
          conversationId: 'conversation-1',
        };
      }),
    };
    const onAccepted = vi.fn().mockResolvedValue(undefined);

    const first = await processInboundMessage(store, message, onAccepted);
    const second = await processInboundMessage(store, message, onAccepted);

    expect(stored).toEqual(['wamid.duplicate-1']);
    expect(store.claim).toHaveBeenCalledTimes(2);
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledWith(message, 'stored-message-1');
    expect(first).toMatchObject({
      accepted: true,
      customerId: 'customer-1',
      conversationId: 'conversation-1',
    });
    expect(second.accepted).toBe(false);
  });
});

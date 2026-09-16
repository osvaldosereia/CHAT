import { describe, expect, it, vi } from 'vitest';
import {
  sendAndRecordMessage,
  type OutboundMessageStore,
  type WhatsAppOutboundClient,
} from './send';

describe('sendAndRecordMessage', () => {
  it('sends a text and persists the returned provider message id', async () => {
    const client: WhatsAppOutboundClient = {
      sendText: vi.fn().mockResolvedValue({ providerMessageId: 'wamid.out-1' }),
      sendImage: vi.fn(),
      sendTemplate: vi.fn(),
    };
    const store: OutboundMessageStore = {
      save: vi.fn().mockResolvedValue({ id: 'message-db-1' }),
    };

    const result = await sendAndRecordMessage(store, client, {
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      to: '5565999999999',
      message: { type: 'text', text: 'Seu pedido foi recebido.' },
    });

    expect(client.sendText).toHaveBeenCalledWith(
      '5565999999999',
      'Seu pedido foi recebido.',
    );
    expect(store.save).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      type: 'text',
      text: 'Seu pedido foi recebido.',
      whatsappMessageId: 'wamid.out-1',
      rawPayload: null,
    });
    expect(result).toEqual({
      storedMessageId: 'message-db-1',
      providerMessageId: 'wamid.out-1',
    });
  });

  it('does not persist an outbound message when the provider send fails', async () => {
    const client: WhatsAppOutboundClient = {
      sendText: vi.fn().mockRejectedValue(new Error('provider failed')),
      sendImage: vi.fn(),
      sendTemplate: vi.fn(),
    };
    const store: OutboundMessageStore = {
      save: vi.fn(),
    };

    await expect(
      sendAndRecordMessage(store, client, {
        conversationId: 'conversation-1',
        customerId: 'customer-1',
        to: '5565999999999',
        message: { type: 'text', text: 'Olá' },
      }),
    ).rejects.toThrow('provider failed');

    expect(store.save).not.toHaveBeenCalled();
  });

  it('persists image metadata after a successful image send', async () => {
    const client: WhatsAppOutboundClient = {
      sendText: vi.fn(),
      sendImage: vi.fn().mockResolvedValue({ providerMessageId: 'wamid.image-1' }),
      sendTemplate: vi.fn(),
    };
    const store: OutboundMessageStore = {
      save: vi.fn().mockResolvedValue({ id: 'message-db-image' }),
    };

    await sendAndRecordMessage(store, client, {
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      to: '5565999999999',
      message: {
        type: 'image',
        image: { id: 'media-123', caption: 'Seu mockup' },
      },
    });

    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        text: 'Seu mockup',
        whatsappMessageId: 'wamid.image-1',
        rawPayload: { mediaId: 'media-123' },
      }),
    );
  });
});

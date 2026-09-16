import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOutboundMessageStore } from './supabase-outbound-message-store';

describe('createSupabaseOutboundMessageStore', () => {
  it('inserts a normalized outbound message into public.messages', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'message-db-1' },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const store = createSupabaseOutboundMessageStore({ from });

    const result = await store.save({
      conversationId: 'conversation-1',
      customerId: 'customer-1',
      type: 'text',
      text: 'Olá',
      whatsappMessageId: 'wamid.out-1',
      rawPayload: null,
    });

    expect(from).toHaveBeenCalledWith('messages');
    expect(insert).toHaveBeenCalledWith({
      conversation_id: 'conversation-1',
      customer_id: 'customer-1',
      direction: 'outbound',
      type: 'text',
      text: 'Olá',
      whatsapp_message_id: 'wamid.out-1',
      raw_payload: null,
    });
    expect(result).toEqual({ id: 'message-db-1' });
  });

  it('throws a normalized error when persistence fails', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'duplicate key' },
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const store = createSupabaseOutboundMessageStore({ from });

    await expect(
      store.save({
        conversationId: 'conversation-1',
        customerId: 'customer-1',
        type: 'text',
        text: 'Olá',
        whatsappMessageId: 'wamid.out-1',
        rawPayload: null,
      }),
    ).rejects.toThrow('Outbound message persistence failed');
  });
});

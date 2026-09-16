import { describe, expect, it, vi } from 'vitest';
import { createSupabaseWhatsAppIngestStore } from './supabase-ingest-store';
import type { NormalizedInboundMessage } from './normalize-event';

const message: NormalizedInboundMessage = {
  messageId: 'wamid.text-1',
  phone: '5565999999999',
  customerName: 'Ana Souza',
  type: 'text',
  text: 'Quero uma caneca',
  mediaId: null,
  timestamp: '1789470000',
  rawPayload: { id: 'wamid.text-1', type: 'text' },
};

describe('createSupabaseWhatsAppIngestStore', () => {
  it('maps the normalized inbound message to the existing ingest RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          accepted: true,
          stored_message_id: 'message-db-1',
          customer_id: 'customer-db-1',
          conversation_id: 'conversation-db-1',
        },
      ],
      error: null,
    });
    const store = createSupabaseWhatsAppIngestStore({ rpc });

    const result = await store.claim(message);

    expect(rpc).toHaveBeenCalledWith('ingest_whatsapp_inbound', {
      p_whatsapp_message_id: 'wamid.text-1',
      p_phone: '5565999999999',
      p_customer_name: 'Ana Souza',
      p_message_type: 'text',
      p_text: 'Quero uma caneca',
      p_raw_payload: { id: 'wamid.text-1', type: 'text' },
      p_created_at: new Date(1789470000 * 1000).toISOString(),
    });
    expect(result).toEqual({
      accepted: true,
      messageId: 'message-db-1',
      customerId: 'customer-db-1',
      conversationId: 'conversation-db-1',
    });
  });

  it('throws a normalized error when the RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });
    const store = createSupabaseWhatsAppIngestStore({ rpc });

    await expect(store.claim(message)).rejects.toThrow('WhatsApp ingest RPC failed');
  });
});

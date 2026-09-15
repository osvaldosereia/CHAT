import { describe, expect, it } from 'vitest';
import { normalizeWhatsappEvent } from './normalize-event';

const baseValue = {
  messaging_product: 'whatsapp',
  metadata: {
    display_phone_number: '5565999990000',
    phone_number_id: 'phone-number-id',
  },
  contacts: [
    {
      profile: { name: 'Ana Souza' },
      wa_id: '5565999999999',
    },
  ],
};

function webhookWithMessage(message: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              ...baseValue,
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

describe('normalizeWhatsappEvent', () => {
  it('normaliza mensagem de texto', () => {
    const result = normalizeWhatsappEvent(
      webhookWithMessage({
        from: '5565999999999',
        id: 'wamid.text-1',
        timestamp: '1789470000',
        type: 'text',
        text: { body: 'Quero uma caneca para aniversário' },
      }),
    );

    expect(result).toEqual([
      {
        messageId: 'wamid.text-1',
        phone: '5565999999999',
        customerName: 'Ana Souza',
        type: 'text',
        text: 'Quero uma caneca para aniversário',
        mediaId: null,
        timestamp: '1789470000',
        rawPayload: expect.any(Object),
      },
    ]);
  });

  it.each([
    ['image', 'image-id'],
    ['audio', 'audio-id'],
    ['document', 'document-id'],
  ] as const)('normaliza mídia %s', (type, mediaId) => {
    const result = normalizeWhatsappEvent(
      webhookWithMessage({
        from: '5565999999999',
        id: `wamid.${type}-1`,
        timestamp: '1789470001',
        type,
        [type]: { id: mediaId, caption: type === 'image' ? 'Referência 1' : undefined },
      }),
    );

    expect(result[0]).toMatchObject({
      messageId: `wamid.${type}-1`,
      phone: '5565999999999',
      type,
      mediaId,
    });
  });

  it('ignora webhook de status sem mensagem recebida', () => {
    const result = normalizeWhatsappEvent({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                ...baseValue,
                statuses: [{ id: 'wamid.outbound', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    });

    expect(result).toEqual([]);
  });

  it('ignora tipos ainda não suportados no MVP sem derrubar o webhook', () => {
    const result = normalizeWhatsappEvent(
      webhookWithMessage({
        from: '5565999999999',
        id: 'wamid.sticker-1',
        timestamp: '1789470002',
        type: 'sticker',
        sticker: { id: 'sticker-id' },
      }),
    );

    expect(result).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createWhatsAppClient,
  WhatsAppApiError,
} from './client';

const clientConfig = {
  accessToken: 'token-test',
  phoneNumberId: '123456789',
  graphVersion: 'v99.0',
};

function successfulFetch(messageId = 'wamid.outbound-1') {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        messaging_product: 'whatsapp',
        contacts: [{ input: '5565999999999', wa_id: '5565999999999' }],
        messages: [{ id: messageId }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
}

describe('createWhatsAppClient', () => {
  it('sends text through the configured Graph API version and phone number', async () => {
    const fetchImpl = successfulFetch();
    const client = createWhatsAppClient({ ...clientConfig, fetchImpl });

    const result = await client.sendText('5565999999999', 'Olá!');

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://graph.facebook.com/v99.0/123456789/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-test',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: '5565999999999',
          type: 'text',
          text: { preview_url: false, body: 'Olá!' },
        }),
      }),
    );
    expect(result).toEqual({ providerMessageId: 'wamid.outbound-1' });
  });

  it('sends an image by Meta media id with an optional caption', async () => {
    const fetchImpl = successfulFetch('wamid.image-1');
    const client = createWhatsAppClient({ ...clientConfig, fetchImpl });

    await client.sendImage('5565999999999', {
      id: 'media-123',
      caption: 'Seu mockup',
    });

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5565999999999',
      type: 'image',
      image: { id: 'media-123', caption: 'Seu mockup' },
    });
  });

  it('sends an approved template with language and components', async () => {
    const fetchImpl = successfulFetch('wamid.template-1');
    const client = createWhatsAppClient({ ...clientConfig, fetchImpl });

    await client.sendTemplate('5565999999999', {
      name: 'pedido_postado',
      languageCode: 'pt_BR',
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: 'CF-001' }],
        },
      ],
    });

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5565999999999',
      type: 'template',
      template: {
        name: 'pedido_postado',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'CF-001' }],
          },
        ],
      },
    });
  });

  it('throws a normalized provider error without exposing the access token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = createWhatsAppClient({ ...clientConfig, fetchImpl });

    await expect(client.sendText('5565999999999', 'Olá')).rejects.toMatchObject({
      name: 'WhatsAppApiError',
      status: 401,
      providerCode: 190,
    });

    try {
      await client.sendText('5565999999999', 'Olá');
    } catch (error) {
      expect(error).toBeInstanceOf(WhatsAppApiError);
      expect(String(error)).not.toContain('token-test');
    }
  });
});

import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../app';
import type { InboundMessageStore } from './ingest';

const verifyToken = 'caneca-secret';
const appSecret = 'app-secret-test';

function webhookWithText(messageId = 'wamid.text-1') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              contacts: [
                {
                  profile: { name: 'Ana Souza' },
                  wa_id: '5565999999999',
                },
              ],
              messages: [
                {
                  from: '5565999999999',
                  id: messageId,
                  timestamp: '1789470000',
                  type: 'text',
                  text: { body: 'Quero uma caneca' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusWebhook() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              statuses: [{ id: 'wamid.outbound', status: 'delivered' }],
            },
          },
        ],
      },
    ],
  };
}

function signatureFor(body: string) {
  return `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
}

function createStore(): InboundMessageStore {
  return {
    claim: vi.fn(async () => ({
      accepted: true,
      messageId: 'stored-message-1',
      customerId: 'customer-1',
      conversationId: 'conversation-1',
    })),
  };
}

describe('WhatsApp webhook verification', () => {
  it('devolve hub.challenge quando mode e verify token são válidos', async () => {
    const app = createApiApp({ whatsappVerifyToken: verifyToken });
    const response = await app.request(
      `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=123456`,
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('123456');
  });

  it('recusa token incorreto sem revelar o token esperado', async () => {
    const app = createApiApp({ whatsappVerifyToken: verifyToken });
    const response = await app.request(
      '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123456',
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.not.toContain(verifyToken);
  });
});

describe('WhatsApp webhook POST', () => {
  it('persiste mensagem válida e executa downstream uma vez', async () => {
    const store = createStore();
    const onInboundAccepted = vi.fn().mockResolvedValue(undefined);
    const app = createApiApp(
      {
        whatsappVerifyToken: verifyToken,
        whatsappAppSecret: appSecret,
      },
      { inboundMessageStore: store, onInboundAccepted },
    );
    const body = JSON.stringify(webhookWithText());

    const response = await app.request('/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signatureFor(body),
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(store.claim).toHaveBeenCalledTimes(1);
    expect(onInboundAccepted).toHaveBeenCalledTimes(1);
  });

  it('aceita evento de status sem criar mensagem inbound', async () => {
    const store = createStore();
    const app = createApiApp(
      { whatsappVerifyToken: verifyToken, whatsappAppSecret: appSecret },
      { inboundMessageStore: store },
    );
    const body = JSON.stringify(statusWebhook());

    const response = await app.request('/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signatureFor(body) },
      body,
    });

    expect(response.status).toBe(200);
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('não executa downstream duas vezes quando o mesmo wamid é repetido', async () => {
    const seen = new Set<string>();
    const store: InboundMessageStore = {
      claim: vi.fn(async (message) => {
        const accepted = !seen.has(message.messageId);
        seen.add(message.messageId);
        return {
          accepted,
          messageId: 'stored-message-1',
          customerId: 'customer-1',
          conversationId: 'conversation-1',
        };
      }),
    };
    const onInboundAccepted = vi.fn().mockResolvedValue(undefined);
    const app = createApiApp(
      { whatsappVerifyToken: verifyToken },
      { inboundMessageStore: store, onInboundAccepted },
    );
    const body = JSON.stringify(webhookWithText('wamid.duplicate'));

    await app.request('/webhooks/whatsapp', { method: 'POST', body });
    const second = await app.request('/webhooks/whatsapp', { method: 'POST', body });

    expect(second.status).toBe(200);
    expect(store.claim).toHaveBeenCalledTimes(2);
    expect(onInboundAccepted).toHaveBeenCalledTimes(1);
  });

  it('recusa assinatura inválida antes de persistir', async () => {
    const store = createStore();
    const app = createApiApp(
      { whatsappVerifyToken: verifyToken, whatsappAppSecret: appSecret },
      { inboundMessageStore: store },
    );
    const body = JSON.stringify(webhookWithText());

    const response = await app.request('/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=invalid' },
      body,
    });

    expect(response.status).toBe(401);
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('retorna 400 para corpo que não é um envelope Meta válido', async () => {
    const store = createStore();
    const app = createApiApp(
      { whatsappVerifyToken: verifyToken },
      { inboundMessageStore: store },
    );

    const response = await app.request('/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(response.status).toBe(400);
    expect(store.claim).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { createApiApp } from '../app';

describe('WhatsApp webhook verification', () => {
  it('devolve hub.challenge quando mode e verify token são válidos', async () => {
    const app = createApiApp({ whatsappVerifyToken: 'caneca-secret' });
    const response = await app.request(
      '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=caneca-secret&hub.challenge=123456',
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('123456');
  });

  it('recusa token incorreto sem revelar o token esperado', async () => {
    const app = createApiApp({ whatsappVerifyToken: 'caneca-secret' });
    const response = await app.request(
      '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123456',
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.not.toContain('caneca-secret');
  });

  it('recusa mode diferente de subscribe', async () => {
    const app = createApiApp({ whatsappVerifyToken: 'caneca-secret' });
    const response = await app.request(
      '/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=caneca-secret&hub.challenge=123456',
    );

    expect(response.status).toBe(403);
  });
});

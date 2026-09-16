import { describe, expect, it } from 'vitest';
import { createApiApp } from './app';

describe('healthcheck', () => {
  it('retorna ok', async () => {
    const response = await createApiApp().request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'caneca-facil-api',
    });
  });
});

describe('API configuration', () => {
  it('registers WhatsApp verification from the canonical app config field', async () => {
    const response = await createApiApp({
      whatsappVerifyToken: 'verify-test',
    }).request(
      '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=42',
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('42');
  });
});

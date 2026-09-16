import { Hono } from 'hono';
import type { ApiConfig } from './config';
import { registerWhatsappWebhook } from './whatsapp/webhook';

export type ApiAppConfig = Partial<ApiConfig>;

export function createApiApp(config: ApiAppConfig = {}) {
  const app = new Hono();

  app.get('/health', (context) =>
    context.json({
      status: 'ok',
      service: 'caneca-facil-api',
    }),
  );

  if (config.whatsappVerifyToken?.trim()) {
    registerWhatsappWebhook(app, {
      verifyToken: config.whatsappVerifyToken,
    });
  }

  return app;
}

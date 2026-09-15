import { Hono } from 'hono';
import { registerWhatsappWebhook } from './whatsapp/webhook';

export interface ApiAppConfig {
  metaVerifyToken?: string;
}

export function createApiApp(config: ApiAppConfig = {}) {
  const app = new Hono();

  app.get('/health', (context) =>
    context.json({
      status: 'ok',
      service: 'caneca-facil-api',
    }),
  );

  if (config.metaVerifyToken?.trim()) {
    registerWhatsappWebhook(app, { verifyToken: config.metaVerifyToken });
  }

  return app;
}

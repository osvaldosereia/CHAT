import type { Hono } from 'hono';

export interface WhatsappWebhookConfig {
  verifyToken: string;
}

export function registerWhatsappWebhook(
  app: Hono,
  config: WhatsappWebhookConfig,
): void {
  app.get('/webhooks/whatsapp', (context) => {
    const mode = context.req.query('hub.mode');
    const token = context.req.query('hub.verify_token');
    const challenge = context.req.query('hub.challenge');

    if (
      mode === 'subscribe' &&
      token === config.verifyToken &&
      typeof challenge === 'string'
    ) {
      return context.text(challenge, 200);
    }

    return context.text('Forbidden', 403);
  });
}

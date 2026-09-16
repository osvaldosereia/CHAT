import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Hono } from 'hono';
import {
  processInboundMessage,
  type InboundMessageStore,
} from './ingest';
import {
  isWhatsappWebhookEnvelope,
  normalizeWhatsappEvent,
  type NormalizedInboundMessage,
} from './normalize-event';

export interface WhatsappWebhookConfig {
  verifyToken: string;
  appSecret?: string;
  store?: InboundMessageStore;
  onAccepted?: (
    message: NormalizedInboundMessage,
    storedMessageId: string,
  ) => Promise<void>;
}

function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const actualHex = signatureHeader.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/i.test(actualHex)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const actual = Buffer.from(actualHex, 'hex');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
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

  app.post('/webhooks/whatsapp', async (context) => {
    const rawBody = await context.req.text();

    if (
      config.appSecret &&
      !verifyMetaSignature(
        rawBody,
        context.req.header('x-hub-signature-256'),
        config.appSecret,
      )
    ) {
      return context.text('Unauthorized', 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return context.text('Bad Request', 400);
    }

    if (!isWhatsappWebhookEnvelope(payload)) {
      return context.text('Bad Request', 400);
    }

    const messages = normalizeWhatsappEvent(payload);
    if (messages.length === 0) {
      return context.text('OK', 200);
    }

    if (!config.store) {
      return context.text('Service Unavailable', 503);
    }

    const onAccepted = config.onAccepted ?? (async () => undefined);
    for (const message of messages) {
      await processInboundMessage(config.store, message, onAccepted);
    }

    return context.text('OK', 200);
  });
}

import { Hono } from 'hono';
import type { ApiConfig } from './config';
import { createServerSupabaseClient } from './lib/supabase';
import type { InboundMessageStore } from './whatsapp/ingest';
import type { NormalizedInboundMessage } from './whatsapp/normalize-event';
import { createSupabaseWhatsAppIngestStore } from './whatsapp/supabase-ingest-store';
import { registerWhatsappWebhook } from './whatsapp/webhook';

export type ApiAppConfig = Partial<ApiConfig>;

export interface ApiAppDependencies {
  inboundMessageStore?: InboundMessageStore;
  onInboundAccepted?: (
    message: NormalizedInboundMessage,
    storedMessageId: string,
  ) => Promise<void>;
}

function resolveInboundStore(
  config: ApiAppConfig,
  dependencies: ApiAppDependencies,
): InboundMessageStore | undefined {
  if (dependencies.inboundMessageStore) {
    return dependencies.inboundMessageStore;
  }

  if (config.supabaseUrl?.trim() && config.supabaseSecretKey?.trim()) {
    const client = createServerSupabaseClient({
      url: config.supabaseUrl,
      secretKey: config.supabaseSecretKey,
    });
    return createSupabaseWhatsAppIngestStore(client);
  }

  return undefined;
}

export function createApiApp(
  config: ApiAppConfig = {},
  dependencies: ApiAppDependencies = {},
) {
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
      appSecret: config.whatsappAppSecret,
      store: resolveInboundStore(config, dependencies),
      onAccepted: dependencies.onInboundAccepted,
    });
  }

  return app;
}

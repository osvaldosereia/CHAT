export interface WhatsAppSendResult {
  providerMessageId: string;
}

export interface WhatsAppImageInput {
  id: string;
  caption?: string;
}

export interface WhatsAppTemplateParameter {
  type: string;
  [key: string]: unknown;
}

export interface WhatsAppTemplateComponent {
  type: string;
  parameters?: WhatsAppTemplateParameter[];
  [key: string]: unknown;
}

export interface WhatsAppTemplateInput {
  name: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
}

export interface WhatsAppClient {
  sendText(to: string, text: string): Promise<WhatsAppSendResult>;
  sendImage(to: string, image: WhatsAppImageInput): Promise<WhatsAppSendResult>;
  sendTemplate(
    to: string,
    template: WhatsAppTemplateInput,
  ): Promise<WhatsAppSendResult>;
}

export interface WhatsAppClientConfig {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
  fetchImpl?: typeof fetch;
}

export class WhatsAppApiError extends Error {
  readonly status: number;
  readonly providerCode: number | null;

  constructor(status: number, providerCode: number | null) {
    super(`WhatsApp API request failed with status ${status}`);
    this.name = 'WhatsAppApiError';
    this.status = status;
    this.providerCode = providerCode;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readProviderCode(payload: unknown): number | null {
  const root = asRecord(payload);
  const error = root ? asRecord(root.error) : null;
  return error && typeof error.code === 'number' ? error.code : null;
}

function readProviderMessageId(payload: unknown): string {
  const root = asRecord(payload);
  const messages = root?.messages;
  if (!Array.isArray(messages)) {
    throw new Error('WhatsApp API returned no message id');
  }

  const first = asRecord(messages[0]);
  if (!first || typeof first.id !== 'string' || !first.id.trim()) {
    throw new Error('WhatsApp API returned no message id');
  }

  return first.id;
}

function validateConfig(config: WhatsAppClientConfig): void {
  for (const [name, value] of [
    ['accessToken', config.accessToken],
    ['phoneNumberId', config.phoneNumberId],
    ['graphVersion', config.graphVersion],
  ] as const) {
    if (!value.trim()) throw new Error(`Invalid WhatsApp client ${name}`);
  }
}

export function createWhatsAppClient(config: WhatsAppClientConfig): WhatsAppClient {
  validateConfig(config);
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = `https://graph.facebook.com/${encodeURIComponent(
    config.graphVersion,
  )}/${encodeURIComponent(config.phoneNumberId)}/messages`;

  async function send(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new WhatsAppApiError(response.status, readProviderCode(payload));
    }

    return { providerMessageId: readProviderMessageId(payload) };
  }

  return {
    sendText(to, text) {
      return send({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      });
    },

    sendImage(to, image) {
      return send({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: {
          id: image.id,
          ...(image.caption ? { caption: image.caption } : {}),
        },
      });
    },

    sendTemplate(to, template) {
      return send({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.languageCode },
          ...(template.components ? { components: template.components } : {}),
        },
      });
    },
  };
}

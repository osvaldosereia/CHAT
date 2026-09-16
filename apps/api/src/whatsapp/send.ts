import type {
  WhatsAppClient,
  WhatsAppImageInput,
  WhatsAppSendResult,
  WhatsAppTemplateInput,
} from './client';

export type WhatsAppOutboundClient = WhatsAppClient;

export type OutboundDatabaseMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'document'
  | 'system';

export interface OutboundMessageRecordInput {
  conversationId: string;
  customerId: string;
  type: OutboundDatabaseMessageType;
  text: string | null;
  whatsappMessageId: string;
  rawPayload: Record<string, unknown> | null;
}

export interface OutboundMessageStore {
  save(input: OutboundMessageRecordInput): Promise<{ id: string }>;
}

export type OutboundMessage =
  | { type: 'text'; text: string }
  | { type: 'image'; image: WhatsAppImageInput }
  | { type: 'template'; template: WhatsAppTemplateInput };

export interface SendAndRecordInput {
  conversationId: string;
  customerId: string;
  to: string;
  message: OutboundMessage;
}

function persistencePayload(
  input: SendAndRecordInput,
  result: WhatsAppSendResult,
): OutboundMessageRecordInput {
  if (input.message.type === 'text') {
    return {
      conversationId: input.conversationId,
      customerId: input.customerId,
      type: 'text',
      text: input.message.text,
      whatsappMessageId: result.providerMessageId,
      rawPayload: null,
    };
  }

  if (input.message.type === 'image') {
    return {
      conversationId: input.conversationId,
      customerId: input.customerId,
      type: 'image',
      text: input.message.image.caption ?? null,
      whatsappMessageId: result.providerMessageId,
      rawPayload: { mediaId: input.message.image.id },
    };
  }

  return {
    conversationId: input.conversationId,
    customerId: input.customerId,
    type: 'system',
    text: null,
    whatsappMessageId: result.providerMessageId,
    rawPayload: {
      outboundType: 'template',
      template: input.message.template,
    },
  };
}

async function send(
  client: WhatsAppOutboundClient,
  input: SendAndRecordInput,
): Promise<WhatsAppSendResult> {
  if (input.message.type === 'text') {
    return client.sendText(input.to, input.message.text);
  }

  if (input.message.type === 'image') {
    return client.sendImage(input.to, input.message.image);
  }

  return client.sendTemplate(input.to, input.message.template);
}

export async function sendAndRecordMessage(
  store: OutboundMessageStore,
  client: WhatsAppOutboundClient,
  input: SendAndRecordInput,
): Promise<{ storedMessageId: string; providerMessageId: string }> {
  const result = await send(client, input);
  const stored = await store.save(persistencePayload(input, result));

  return {
    storedMessageId: stored.id,
    providerMessageId: result.providerMessageId,
  };
}

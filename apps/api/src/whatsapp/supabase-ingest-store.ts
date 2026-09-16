import type { InboundMessageClaim, InboundMessageStore } from './ingest';
import type { NormalizedInboundMessage } from './normalize-event';

interface RpcResult {
  data: unknown;
  error: { message?: string } | null;
}

export interface SupabaseRpcClient {
  rpc(
    functionName: string,
    params: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoTimestamp(timestamp: string): string {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) {
    throw new Error('Invalid WhatsApp message timestamp');
  }
  return new Date(seconds * 1000).toISOString();
}

function mapRpcRow(data: unknown): InboundMessageClaim {
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) {
    throw new Error('WhatsApp ingest RPC returned no result');
  }

  const accepted = row.accepted;
  const messageId = row.stored_message_id;
  const customerId = row.customer_id;
  const conversationId = row.conversation_id;

  if (
    typeof accepted !== 'boolean' ||
    typeof messageId !== 'string' ||
    typeof customerId !== 'string' ||
    typeof conversationId !== 'string'
  ) {
    throw new Error('WhatsApp ingest RPC returned an invalid result');
  }

  return {
    accepted,
    messageId,
    customerId,
    conversationId,
  };
}

export function createSupabaseWhatsAppIngestStore(
  client: SupabaseRpcClient,
): InboundMessageStore {
  return {
    async claim(message: NormalizedInboundMessage) {
      const { data, error } = await client.rpc('ingest_whatsapp_inbound', {
        p_whatsapp_message_id: message.messageId,
        p_phone: message.phone,
        p_customer_name: message.customerName,
        p_message_type: message.type,
        p_text: message.text,
        p_raw_payload: message.rawPayload,
        p_created_at: toIsoTimestamp(message.timestamp),
      });

      if (error) {
        throw new Error('WhatsApp ingest RPC failed');
      }

      return mapRpcRow(data);
    },
  };
}

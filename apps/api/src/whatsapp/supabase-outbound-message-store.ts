import type {
  OutboundMessageRecordInput,
  OutboundMessageStore,
} from './send';

interface SupabaseSingleResult {
  data: { id?: unknown } | null;
  error: { message?: string } | null;
}

export interface SupabaseOutboundMessageClient {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<SupabaseSingleResult>;
      };
    };
  };
}

export function createSupabaseOutboundMessageStore(
  client: SupabaseOutboundMessageClient,
): OutboundMessageStore {
  return {
    async save(input: OutboundMessageRecordInput) {
      const { data, error } = await client
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          customer_id: input.customerId,
          direction: 'outbound',
          type: input.type,
          text: input.text,
          whatsapp_message_id: input.whatsappMessageId,
          raw_payload: input.rawPayload,
        })
        .select('id')
        .single();

      if (error || !data || typeof data.id !== 'string') {
        throw new Error('Outbound message persistence failed');
      }

      return { id: data.id };
    },
  };
}

export type SupportedInboundMessageType = 'text' | 'image' | 'audio' | 'document';

export interface NormalizedInboundMessage {
  messageId: string;
  phone: string;
  customerName: string | null;
  type: SupportedInboundMessageType;
  text: string | null;
  mediaId: string | null;
  timestamp: string;
  rawPayload: Record<string, unknown>;
}

type UnknownRecord = Record<string, unknown>;

const SUPPORTED_TYPES = new Set<SupportedInboundMessageType>([
  'text',
  'image',
  'audio',
  'document',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function findCustomerName(value: UnknownRecord, phone: string): string | null {
  const contacts = asRecordArray(value.contacts);
  const contact = contacts.find((item) => item.wa_id === phone) ?? contacts[0];
  if (!contact) return null;

  const profile = isRecord(contact.profile) ? contact.profile : null;
  return profile ? stringValue(profile.name) : null;
}

function normalizeMessage(
  message: UnknownRecord,
  value: UnknownRecord,
): NormalizedInboundMessage | null {
  const messageId = stringValue(message.id);
  const phone = stringValue(message.from);
  const timestamp = stringValue(message.timestamp);
  const rawType = stringValue(message.type);

  if (!messageId || !phone || !timestamp || !rawType) return null;
  if (!SUPPORTED_TYPES.has(rawType as SupportedInboundMessageType)) return null;

  const type = rawType as SupportedInboundMessageType;
  let text: string | null = null;
  let mediaId: string | null = null;

  if (type === 'text') {
    const textObject = isRecord(message.text) ? message.text : null;
    text = textObject ? stringValue(textObject.body) : null;
  } else {
    const mediaObject = isRecord(message[type]) ? message[type] : null;
    mediaId = mediaObject ? stringValue(mediaObject.id) : null;
    text = mediaObject ? stringValue(mediaObject.caption) : null;

    if (!mediaId) return null;
  }

  return {
    messageId,
    phone,
    customerName: findCustomerName(value, phone),
    type,
    text,
    mediaId,
    timestamp,
    rawPayload: message,
  };
}

export function normalizeWhatsappEvent(payload: unknown): NormalizedInboundMessage[] {
  if (!isRecord(payload) || payload.object !== 'whatsapp_business_account') return [];

  const normalized: NormalizedInboundMessage[] = [];

  for (const entry of asRecordArray(payload.entry)) {
    for (const change of asRecordArray(entry.changes)) {
      if (change.field !== 'messages' || !isRecord(change.value)) continue;
      const value = change.value;

      for (const message of asRecordArray(value.messages)) {
        const item = normalizeMessage(message, value);
        if (item) normalized.push(item);
      }
    }
  }

  return normalized;
}

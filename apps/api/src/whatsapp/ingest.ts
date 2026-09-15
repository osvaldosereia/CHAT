import type { NormalizedInboundMessage } from './normalize-event';

export interface InboundMessageClaim {
  accepted: boolean;
  messageId: string;
}

export interface InboundMessageStore {
  claim(message: NormalizedInboundMessage): Promise<InboundMessageClaim>;
}

export async function processInboundMessage(
  store: InboundMessageStore,
  message: NormalizedInboundMessage,
  onAccepted: (
    message: NormalizedInboundMessage,
    storedMessageId: string,
  ) => Promise<void>,
): Promise<InboundMessageClaim> {
  const claim = await store.claim(message);

  if (claim.accepted) {
    await onAccepted(message, claim.messageId);
  }

  return claim;
}

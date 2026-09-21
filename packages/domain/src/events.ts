import type { ISODateTime, UUID } from "./contracts";

export type CustomerEventType =
  | "customer.created"
  | "conversation.started"
  | "message.received"
  | "product.searched"
  | "product.viewed"
  | "basket.viewed"
  | "basket.selected"
  | "offer.viewed"
  | "offer.added"
  | "cart.created"
  | "cart.abandoned"
  | "order.created"
  | "order.confirmed"
  | "order.delivered"
  | "human.requested"
  | "human.assigned";

export interface CustomerEvent {
  id: UUID;
  organizationId: UUID;
  customerId: UUID | null;
  conversationId: UUID | null;
  type: CustomerEventType;
  occurredAt: ISODateTime;
  data: Record<string, unknown>;
}

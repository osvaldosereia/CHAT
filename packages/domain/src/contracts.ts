export type UUID = string;
export type ISODateTime = string;

export type ConversationChannel =
  | "web"
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "other";

export type ConversationStatus =
  | "open"
  | "waiting_customer"
  | "waiting_human"
  | "human_active"
  | "closed";

export type MessageSenderType = "customer" | "assistant" | "human" | "system";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "document"
  | "product"
  | "product_list"
  | "basket"
  | "offer"
  | "cart"
  | "order"
  | "location"
  | "system";

export interface OrganizationRef {
  organizationId: UUID;
}

export interface Customer extends OrganizationRef {
  id: UUID;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  status: "lead" | "active" | "inactive" | "blocked";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CustomerIdentity extends OrganizationRef {
  id: UUID;
  customerId: UUID;
  kind:
    | "phone"
    | "cpf"
    | "email"
    | "web_session"
    | "whatsapp"
    | "instagram"
    | "external";
  normalizedValue: string;
  verifiedAt: ISODateTime | null;
  isPrimary: boolean;
}

export interface Conversation extends OrganizationRef {
  id: UUID;
  customerId: UUID | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  assignedUserId: UUID | null;
  startedAt: ISODateTime;
  lastMessageAt: ISODateTime;
}

export interface ChatMessage extends OrganizationRef {
  id: UUID;
  conversationId: UUID;
  senderType: MessageSenderType;
  senderId: UUID | null;
  type: MessageType;
  text: string | null;
  payload: Record<string, unknown>;
  createdAt: ISODateTime;
}

export interface Product extends OrganizationRef {
  id: UUID;
  sku: string | null;
  name: string;
  active: boolean;
  salePriceCents: number;
  imageUrl: string | null;
}

export interface CartItemSnapshot {
  productId: UUID;
  name: string;
  sku: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface CustomerContextSummary {
  customerId: UUID;
  displayName: string | null;
  lastOrderAt: ISODateTime | null;
  ordersCount: number;
  lifetimeValueCents: number;
  averageOrderValueCents: number;
  averageReorderDays: number | null;
  lastBasketId: UUID | null;
  recurringProductIds: UUID[];
}

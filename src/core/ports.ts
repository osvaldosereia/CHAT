import type { KnowledgeEntry, ProductSummary } from './types'

export type CustomerInput = {
  name: string
  phone: string
  document?: string
  address?: {
    street: string
    number: string
    complement?: string
    district: string
    city: string
    state: string
    zipCode?: string
  }
}

export type CartItem = {
  blingProductId: string
  sku: string
  name: string
  quantity: number
  unitPrice: number
}

export type ConfirmedOrderInput = {
  customer: CustomerInput
  items: CartItem[]
  deliveryFee: number
  discount: number
  total: number
  source: 'whatsapp'
}

/**
 * Porta para o Bling. A UI não deve conhecer OAuth, endpoints ou tokens.
 * A implementação real entra depois em um adapter seguro.
 */
export interface BlingGateway {
  searchProducts(query: string): Promise<ProductSummary[]>
  getProduct(productId: string): Promise<ProductSummary>
  validateItems(items: CartItem[]): Promise<CartItem[]>
  upsertCustomer(customer: CustomerInput): Promise<{ blingContactId: string }>
  createSalesOrder(input: ConfirmedOrderInput): Promise<{ blingOrderId: string }>
}

/**
 * Porta para a base oficial de conhecimento administrada no CHAT.
 */
export interface KnowledgeRepository {
  list(): Promise<KnowledgeEntry[]>
  save(entry: KnowledgeEntry): Promise<KnowledgeEntry>
  remove(id: string): Promise<void>
}

/**
 * Porta para ações em tempo real executadas pelo Make.
 * Nenhum segredo/webhook privado deve ser exposto diretamente no browser.
 */
export interface AutomationGateway {
  getHealth(): Promise<{
    make: boolean
    whatsapp: boolean
    openai: boolean
  }>
  pauseConversation(conversationId: string): Promise<void>
  resumeConversation(conversationId: string): Promise<void>
}

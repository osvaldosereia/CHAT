export type IntegrationStatus = 'connected' | 'pending' | 'error'

export type Integration = {
  id: 'bling' | 'make' | 'meta' | 'openai'
  name: string
  status: IntegrationStatus
  detail: string
}

export type DashboardMetric = {
  label: string
  value: string
  hint: string
}

export type ModuleId =
  | 'dashboard'
  | 'products'
  | 'baskets'
  | 'knowledge'
  | 'whatsapp'
  | 'orders'
  | 'settings'

export type NavigationItem = {
  id: ModuleId
  label: string
  description: string
}

export type KnowledgeCategory =
  | 'Empresa'
  | 'Atendimento'
  | 'Entregas'
  | 'Pagamentos'
  | 'Cestas'
  | 'Pós-venda'

export type KnowledgeEntry = {
  id: string
  category: KnowledgeCategory
  title: string
  content: string
  active: boolean
  updatedAt: string
}

export type BasketItem = {
  blingId: string
  sku: string
  name: string
  quantity: number
}

export type Basket = {
  id: string
  blingId?: string
  sku?: string
  name: string
  description: string
  salesGuidance: string
  substitutionRules: string
  active: boolean
  items: BasketItem[]
  updatedAt: string
}

export type ProductSummary = {
  id: string
  blingId: string
  name: string
  sku: string
  gtin?: string
  price: number
  stock: number | null
  active: boolean
  source: 'bling'
}

export type ProductCatalog = {
  source: 'bling'
  generatedAt: string | null
  count: number
  stockIncluded: boolean
  items: ProductSummary[]
}

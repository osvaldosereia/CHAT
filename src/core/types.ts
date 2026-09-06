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

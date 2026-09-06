import type { ProductCatalog } from '../core/types'

const EMPTY_CATALOG: ProductCatalog = {
  source: 'bling',
  generatedAt: null,
  count: 0,
  stockIncluded: false,
  items: [],
}

function isCatalog(value: unknown): value is ProductCatalog {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ProductCatalog>
  return candidate.source === 'bling' && Array.isArray(candidate.items)
}

export async function loadProductCatalog(signal?: AbortSignal): Promise<ProductCatalog> {
  const configuredUrl = import.meta.env.VITE_CATALOG_URL as string | undefined
  const url = configuredUrl?.trim() || '/data/products.json'

  try {
    const response = await fetch(url, { signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`Catálogo indisponível (${response.status})`)

    const payload: unknown = await response.json()
    if (!isCatalog(payload)) throw new Error('Formato de catálogo inválido')

    return {
      ...payload,
      count: payload.items.length,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    console.warn('[catalog] usando catálogo vazio:', error)
    return EMPTY_CATALOG
  }
}

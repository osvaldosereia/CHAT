import { useEffect, useMemo, useState } from 'react'
import type { ProductCatalog } from '../core/types'
import { loadProductCatalog } from '../services/catalog'
import './products.css'

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatDate(value: string | null) {
  if (!value) return 'Ainda não sincronizado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function ProductsModule() {
  const [catalog, setCatalog] = useState<ProductCatalog | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    loadProductCatalog(controller.signal)
      .then(setCatalog)
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    if (!catalog || !normalized) return catalog?.items ?? []

    return catalog.items.filter((product) =>
      [product.name, product.sku, product.gtin, product.blingId]
        .filter(Boolean)
        .some((field) => field!.toLocaleLowerCase('pt-BR').includes(normalized)),
    )
  }, [catalog, query])

  return (
    <section className="panel product-module">
      <div className="panel-heading product-heading">
        <div>
          <span className="eyebrow">Bling / catálogo</span>
          <h2>Produtos</h2>
        </div>
        <div className="sync-state">
          <strong>{catalog?.count ?? 0} produtos</strong>
          <span>{formatDate(catalog?.generatedAt ?? null)}</span>
        </div>
      </div>

      <div className="product-toolbar">
        <label className="search-field">
          <span>Buscar produto</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, SKU, GTIN ou ID Bling"
          />
        </label>
        <div className="catalog-rule">
          <strong>Fonte oficial: Bling</strong>
          <span>Preço e estoque não são definidos pela IA.</span>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Carregando catálogo…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <strong>{query ? 'Nenhum produto encontrado.' : 'Catálogo ainda não sincronizado.'}</strong>
          <span>
            {query
              ? 'Tente outro nome, SKU ou GTIN.'
              : 'A tela já está pronta. A próxima conexão segura com o Bling preencherá estes dados.'}
          </span>
        </div>
      ) : (
        <div className="product-table-wrap">
          <table className="product-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Preço</th>
                <th>Estoque</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    <small>ID Bling {product.blingId}</small>
                  </td>
                  <td>{product.sku || '—'}</td>
                  <td>{currency.format(product.price)}</td>
                  <td>{product.stock === null ? '—' : product.stock}</td>
                  <td>
                    <span className={product.active ? 'pill pill--active' : 'pill'}>
                      {product.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

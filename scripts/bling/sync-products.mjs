import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const API_BASE = (process.env.BLING_API_BASE || 'https://api.bling.com.br/Api/v3').replace(/\/$/, '')
const ACCESS_TOKEN = process.env.BLING_ACCESS_TOKEN
const OUTPUT_PATH = resolve(process.env.BLING_PRODUCTS_OUTPUT || 'runtime/products.json')
const PAGE_SIZE = 100
const REQUEST_DELAY_MS = 360

if (!ACCESS_TOKEN) {
  console.error('BLING_ACCESS_TOKEN não informado. Nenhuma requisição foi realizada.')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

async function requestJson(path, attempt = 1) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'enable-jwt': '1',
    },
  })

  if (response.status === 429 && attempt <= 5) {
    const retryAfter = Number(response.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(1000 * 2 ** attempt, 10000)

    console.warn(`Bling respondeu 429. Nova tentativa em ${waitMs}ms.`)
    await sleep(waitMs)
    return requestJson(path, attempt + 1)
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Bling ${response.status}: ${body.slice(0, 600)}`)
  }

  const payload = await response.json()
  await sleep(REQUEST_DELAY_MS)
  return payload
}

async function listProducts() {
  const products = []

  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({
      pagina: String(page),
      limite: String(PAGE_SIZE),
    })
    const payload = await requestJson(`/produtos?${params}`)
    const data = Array.isArray(payload?.data) ? payload.data : []
    products.push(...data)

    console.log(`Produtos: página ${page}, ${data.length} registros.`)
    if (data.length < PAGE_SIZE) break
  }

  return products
}

function stockProductId(entry) {
  return String(
    entry?.produto?.id ??
    entry?.idProduto ??
    entry?.produtoId ??
    entry?.id ??
    '',
  )
}

async function fetchStock(productIds) {
  const stock = new Map()
  const batchSize = 50

  for (let offset = 0; offset < productIds.length; offset += batchSize) {
    const batch = productIds.slice(offset, offset + batchSize)
    const params = new URLSearchParams()
    for (const id of batch) params.append('idsProdutos[]', id)

    const payload = await requestJson(`/estoques/saldos?${params}`)
    const data = Array.isArray(payload?.data) ? payload.data : []

    for (const entry of data) {
      const id = stockProductId(entry)
      if (!id) continue
      const value = entry?.saldoVirtualTotal ?? entry?.saldoFisicoTotal
      stock.set(id, Number.isFinite(Number(value)) ? Number(value) : null)
    }

    console.log(`Estoque: ${Math.min(offset + batch.length, productIds.length)}/${productIds.length}.`)
  }

  return stock
}

function normalizeProduct(product, stock) {
  const id = String(product?.id ?? '')
  return {
    id,
    blingId: id,
    name: String(product?.nome ?? '').trim(),
    sku: String(product?.codigo ?? '').trim(),
    gtin: String(product?.gtin ?? '').trim() || undefined,
    price: Number(product?.preco ?? 0) || 0,
    stock: stock.has(id) ? stock.get(id) : null,
    active: String(product?.situacao ?? 'A').toUpperCase() === 'A',
    source: 'bling',
  }
}

async function main() {
  console.log(`Sincronizando produtos via ${API_BASE}`)
  const rawProducts = await listProducts()
  const ids = rawProducts.map((product) => String(product?.id ?? '')).filter(Boolean)
  const stock = ids.length ? await fetchStock(ids) : new Map()
  const items = rawProducts.map((product) => normalizeProduct(product, stock))

  const catalog = {
    source: 'bling',
    generatedAt: new Date().toISOString(),
    count: items.length,
    stockIncluded: stock.size > 0,
    items,
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  console.log(`Catálogo salvo em ${OUTPUT_PATH}: ${items.length} produtos.`)
}

main().catch((error) => {
  console.error('Falha na sincronização do Bling:', error)
  process.exit(1)
})

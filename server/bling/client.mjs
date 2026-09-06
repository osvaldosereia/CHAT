const DEFAULT_BASE_URL = 'https://api.bling.com.br/Api/v3'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class BlingClient {
  constructor({ accessToken, baseUrl = DEFAULT_BASE_URL, minIntervalMs = 360 }) {
    if (!accessToken) throw new Error('BlingClient exige accessToken')
    this.accessToken = accessToken
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.minIntervalMs = minIntervalMs
  }

  async request(path, options = {}, attempt = 1) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'enable-jwt': '1',
        ...options.headers,
      },
    })

    if (response.status === 429 && attempt <= 5) {
      const retryAfter = Number(response.headers.get('retry-after'))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(1000 * 2 ** attempt, 10000)
      await sleep(delay)
      return this.request(path, options, attempt + 1)
    }

    const raw = await response.text()
    let payload
    try {
      payload = raw ? JSON.parse(raw) : {}
    } catch {
      payload = { raw }
    }

    if (!response.ok) {
      const error = new Error(`Bling ${response.status}: ${JSON.stringify(payload)}`)
      error.status = response.status
      error.payload = payload
      throw error
    }

    await sleep(this.minIntervalMs)
    return payload
  }

  listProducts({ page = 1, limit = 100, search } = {}) {
    const params = new URLSearchParams({ pagina: String(page), limite: String(limit) })
    if (search) params.set('criterio', search)
    return this.request(`/produtos?${params}`)
  }

  getProduct(productId) {
    return this.request(`/produtos/${encodeURIComponent(productId)}`)
  }

  getStock(productIds) {
    const params = new URLSearchParams()
    for (const id of productIds) params.append('idsProdutos[]', String(id))
    return this.request(`/estoques/saldos?${params}`)
  }

  listContacts({ page = 1, limit = 100, search } = {}) {
    const params = new URLSearchParams({ pagina: String(page), limite: String(limit) })
    if (search) params.set('pesquisa', search)
    return this.request(`/contatos?${params}`)
  }

  getContact(contactId) {
    return this.request(`/contatos/${encodeURIComponent(contactId)}`)
  }

  createContact(contactPayload) {
    return this.request('/contatos', {
      method: 'POST',
      body: JSON.stringify(contactPayload),
    })
  }

  createSalesOrder(orderPayload) {
    return this.request('/pedidos/vendas', {
      method: 'POST',
      body: JSON.stringify(orderPayload),
    })
  }
}

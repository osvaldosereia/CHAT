type BridgeRequest<TPayload = unknown> = {
  action: string
  requestId: string
  adminKey: string
  payload?: TPayload
}

export type BridgeResponse<TData = unknown> = {
  ok: boolean
  requestId?: string
  data?: TData
  error?: {
    code: string
    message: string
  }
}

const ADMIN_KEY_STORAGE = 'chat.admin.session-key'
const BRIDGE_URL_STORAGE = 'chat.admin.bridge-url'

export function getBridgeUrl() {
  const sessionUrl = window.sessionStorage.getItem(BRIDGE_URL_STORAGE)?.trim()
  if (sessionUrl) return sessionUrl
  return (import.meta.env.VITE_ADMIN_BRIDGE_URL as string | undefined)?.trim() || ''
}

export function setBridgeUrl(value: string) {
  const normalized = value.trim()
  if (normalized) window.sessionStorage.setItem(BRIDGE_URL_STORAGE, normalized)
  else window.sessionStorage.removeItem(BRIDGE_URL_STORAGE)
}

export function isBridgeConfigured() {
  return Boolean(getBridgeUrl())
}

export function getAdminSessionKey() {
  return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? ''
}

export function setAdminSessionKey(value: string) {
  const normalized = value.trim()
  if (normalized) window.sessionStorage.setItem(ADMIN_KEY_STORAGE, normalized)
  else window.sessionStorage.removeItem(ADMIN_KEY_STORAGE)
}

export function getBridgeOrigin() {
  const url = getBridgeUrl()
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return 'URL inválida'
  }
}

export async function callMakeBridge<TData, TPayload = unknown>(
  action: string,
  payload?: TPayload,
  signal?: AbortSignal,
): Promise<TData> {
  const url = getBridgeUrl()
  if (!url) throw new Error('URL da ponte Make não configurada nesta sessão')

  const adminKey = getAdminSessionKey()
  if (!adminKey) throw new Error('Chave administrativa não informada nesta sessão')

  const request: BridgeRequest<TPayload> = {
    action,
    requestId: crypto.randomUUID(),
    adminKey,
    payload,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
    cache: 'no-store',
  })

  if (!response.ok) throw new Error(`Ponte Make indisponível (${response.status})`)

  const result = await response.json() as BridgeResponse<TData>
  if (!result.ok) {
    throw new Error(result.error?.message || 'Operação recusada pela ponte Make')
  }

  return result.data as TData
}

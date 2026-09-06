const TOKEN_URL = 'https://api.bling.com.br/Api/v3/oauth/token'

function basicAuth(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')
}

async function tokenRequest({ clientId, clientSecret, body }) {
  if (!clientId || !clientSecret) throw new Error('Credenciais OAuth do Bling ausentes')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
      'enable-jwt': '1',
    },
    body: new URLSearchParams(body),
  })

  const raw = await response.text()
  let payload
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = { raw }
  }

  if (!response.ok) {
    throw new Error(`Falha OAuth Bling (${response.status}): ${JSON.stringify(payload)}`)
  }

  if (!payload?.access_token) throw new Error('Bling não retornou access_token')
  return payload
}

export function exchangeAuthorizationCode({ clientId, clientSecret, code }) {
  if (!code) throw new Error('Authorization code ausente')
  return tokenRequest({
    clientId,
    clientSecret,
    body: {
      grant_type: 'authorization_code',
      code,
    },
  })
}

export function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  if (!refreshToken) throw new Error('Refresh token ausente')
  return tokenRequest({
    clientId,
    clientSecret,
    body: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
  })
}

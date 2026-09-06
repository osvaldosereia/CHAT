import { FormEvent, useMemo, useState } from 'react'
import {
  callMakeBridge,
  getAdminSessionKey,
  getBridgeOrigin,
  getBridgeUrl,
  setAdminSessionKey,
  setBridgeUrl,
} from '../services/makeBridge'

type PingResult = {
  service?: string
  version?: string
  bling?: string
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function SettingsModule() {
  const [bridgeUrl, setBridgeUrlInput] = useState(() => getBridgeUrl())
  const [key, setKey] = useState(() => getAdminSessionKey())
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const urlValid = useMemo(() => isHttpUrl(bridgeUrl.trim()), [bridgeUrl])
  const bridgeConfigured = Boolean(bridgeUrl.trim() && urlValid)

  function saveSessionSettings(event: FormEvent) {
    event.preventDefault()

    if (bridgeUrl.trim() && !urlValid) {
      setStatus('error')
      setMessage('Informe uma URL HTTP/HTTPS válida para a ponte Make.')
      return
    }

    setBridgeUrl(bridgeUrl)
    setAdminSessionKey(key)
    setStatus('idle')
    setMessage(
      bridgeUrl.trim() || key.trim()
        ? 'Configuração guardada somente nesta sessão do navegador.'
        : 'Configuração da sessão removida.',
    )
  }

  async function testBridge() {
    if (!bridgeConfigured || !key.trim()) return

    setBridgeUrl(bridgeUrl)
    setAdminSessionKey(key)
    setStatus('testing')
    setMessage('Testando conexão…')

    try {
      const result = await callMakeBridge<PingResult>('system.ping')
      setStatus('success')
      setMessage(`Ponte respondeu${result?.version ? ` — versão ${result.version}` : ''}.`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Falha ao testar a ponte Make.')
    }
  }

  const configuredOrigin = bridgeConfigured ? getBridgeOrigin() : ''

  return (
    <div className="admin-split settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Integração mínima</span>
            <h2>Ponte Make</h2>
          </div>
          <span className={bridgeConfigured ? 'status status--connected' : 'status status--pending'}>
            {bridgeConfigured ? 'URL informada' : 'Pendente'}
          </span>
        </div>

        <p className="module-intro">
          Para o MVP, operações imediatas do Admin passam por um único webhook protegido no Make. Assim não precisamos contratar um servidor próprio agora.
        </p>

        <dl className="settings-list">
          <div>
            <dt>Endpoint</dt>
            <dd>{bridgeConfigured ? 'Mantido somente na sessão do navegador' : 'Ainda não informado'}</dd>
          </div>
          <div>
            <dt>Segredo no código</dt>
            <dd>Nenhum. URL e chave podem ser informadas na sessão e não são commitadas no GitHub.</dd>
          </div>
          <div>
            <dt>Uso do Make</dt>
            <dd>Somente ações imediatas: WhatsApp, consulta/alteração Bling e persistência compartilhada.</dd>
          </div>
        </dl>

        {configuredOrigin && configuredOrigin !== 'URL inválida' && (
          <small className="technical-note">Origem configurada: {configuredOrigin}</small>
        )}
      </section>

      <section className="panel sticky-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Sessão</span>
            <h2>Conectar Admin ao Make</h2>
          </div>
        </div>

        <form className="admin-form" onSubmit={saveSessionSettings}>
          <label>
            <span>URL do webhook do Admin Bridge</span>
            <input
              type="url"
              autoComplete="off"
              value={bridgeUrl}
              onChange={(event) => setBridgeUrlInput(event.target.value)}
              placeholder="https://hook...make.com/..."
            />
          </label>

          <label>
            <span>Admin Key</span>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Informe a chave configurada no Make"
            />
          </label>

          <p className="security-copy">
            URL e chave não são gravadas no repositório nem em localStorage. Elas permanecem apenas em sessionStorage e desaparecem ao encerrar a sessão do navegador.
          </p>

          <div className="form-actions">
            <button className="button button--secondary" type="submit">Salvar na sessão</button>
            <button
              className="button button--primary"
              type="button"
              disabled={!bridgeConfigured || !key.trim() || status === 'testing'}
              onClick={testBridge}
            >
              {status === 'testing' ? 'Testando…' : 'Testar conexão'}
            </button>
          </div>

          {message && (
            <div className={`bridge-message bridge-message--${status}`}>{message}</div>
          )}
        </form>
      </section>
    </div>
  )
}

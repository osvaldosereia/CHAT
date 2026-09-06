import { FormEvent, useState } from 'react'
import {
  callMakeBridge,
  getAdminSessionKey,
  getBridgeUrl,
  isBridgeConfigured,
  setAdminSessionKey,
} from '../services/makeBridge'

type PingResult = {
  service?: string
  version?: string
  bling?: string
}

export function SettingsModule() {
  const [key, setKey] = useState(() => getAdminSessionKey())
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const bridgeConfigured = isBridgeConfigured()

  function saveKey(event: FormEvent) {
    event.preventDefault()
    setAdminSessionKey(key)
    setMessage(key.trim() ? 'Chave guardada somente nesta sessão do navegador.' : 'Chave removida da sessão.')
    setStatus('idle')
  }

  async function testBridge() {
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

  return (
    <div className="admin-split settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Integração mínima</span>
            <h2>Ponte Make</h2>
          </div>
          <span className={bridgeConfigured ? 'status status--connected' : 'status status--pending'}>
            {bridgeConfigured ? 'URL configurada' : 'Pendente'}
          </span>
        </div>

        <p className="module-intro">
          Para o MVP, operações imediatas do Admin passam por um único webhook protegido no Make. Assim não precisamos contratar um servidor próprio agora.
        </p>

        <dl className="settings-list">
          <div>
            <dt>Endpoint</dt>
            <dd>{bridgeConfigured ? 'Configurado via VITE_ADMIN_BRIDGE_URL' : 'Ainda não configurado'}</dd>
          </div>
          <div>
            <dt>Segredo no código</dt>
            <dd>Nenhum. A chave administrativa é informada na sessão.</dd>
          </div>
          <div>
            <dt>Uso do Make</dt>
            <dd>Somente ações imediatas: WhatsApp, consulta/alteração Bling e persistência compartilhada.</dd>
          </div>
        </dl>

        {bridgeConfigured && (
          <small className="technical-note">Origem configurada: {new URL(getBridgeUrl()).origin}</small>
        )}
      </section>

      <section className="panel sticky-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Sessão</span>
            <h2>Chave administrativa</h2>
          </div>
        </div>

        <form className="admin-form" onSubmit={saveKey}>
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
            Esta chave não é gravada no repositório nem em localStorage. Ela permanece apenas em sessionStorage e desaparece ao encerrar a sessão do navegador.
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

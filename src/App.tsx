import { useMemo, useState } from 'react'
import type {
  DashboardMetric,
  Integration,
  ModuleId,
  NavigationItem,
} from './core/types'
import { ProductsModule } from './modules/ProductsModule'

const navigation: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Visão geral da operação' },
  { id: 'products', label: 'Produtos', description: 'Catálogo oficial do Bling' },
  { id: 'baskets', label: 'Cestas', description: 'Cestas básicas e regras comerciais' },
  { id: 'knowledge', label: 'Conhecimento', description: 'Regras da empresa e atendimento' },
  { id: 'whatsapp', label: 'WhatsApp', description: 'Automação e conversas' },
  { id: 'orders', label: 'Pedidos', description: 'Pedidos em andamento e confirmados' },
  { id: 'settings', label: 'Configurações', description: 'Integrações e segurança' },
]

const integrations: Integration[] = [
  { id: 'bling', name: 'Bling', status: 'pending', detail: 'Camada de catálogo pronta; falta autorizar OAuth/API' },
  { id: 'make', name: 'Make', status: 'pending', detail: 'Aguardando webhook do primeiro cenário' },
  { id: 'meta', name: 'WhatsApp Meta', status: 'pending', detail: 'Será conectado pelo Make' },
  { id: 'openai', name: 'OpenAI', status: 'pending', detail: 'Será usado no cenário do Make' },
]

const metrics: DashboardMetric[] = [
  { label: 'Produtos', value: '—', hint: 'Tela pronta; sincronização Bling pendente' },
  { label: 'Cestas ativas', value: '0', hint: 'Próximo módulo após catálogo real' },
  { label: 'Conversas abertas', value: '0', hint: 'WhatsApp ainda não conectado' },
  { label: 'Pedidos hoje', value: '0', hint: 'Pedidos confirmados irão para o Bling' },
]

const moduleCopy: Record<ModuleId, { title: string; intro: string; next: string[] }> = {
  dashboard: {
    title: 'Dashboard',
    intro: 'Acompanhe o mínimo necessário para saber se atendimento, catálogo e pedidos estão funcionando.',
    next: ['Autorizar Bling', 'Cadastrar regras da empresa', 'Conectar cenário do Make'],
  },
  products: {
    title: 'Produtos',
    intro: 'Espelho de consulta do catálogo do Bling. Preço, estoque, SKU e status continuam tendo o Bling como fonte oficial.',
    next: ['OAuth do Bling', 'Sincronização segura', 'Busca por nome, SKU e GTIN'],
  },
  baskets: {
    title: 'Cestas básicas',
    intro: 'Cestas serão vinculadas aos produtos/composições do Bling e receberão no Admin as informações que a IA usa para vender e orientar.',
    next: ['Vincular produto do Bling', 'Composição', 'Descrição comercial e regras'],
  },
  knowledge: {
    title: 'Base de conhecimento',
    intro: 'Regras oficiais da Dona Antônia: atendimento, entrega, pagamento, cestas e pós-venda. A IA consulta esta base; não aprende regras diretamente com clientes.',
    next: ['Empresa', 'Entrega e pagamento', 'Atendimento e pós-venda'],
  },
  whatsapp: {
    title: 'WhatsApp',
    intro: 'O Make ficará no caminho em tempo real: recebe a mensagem oficial da Meta, consulta o contexto, chama OpenAI quando necessário e responde.',
    next: ['Webhook inbound', 'Texto primeiro', 'Handoff para humano'],
  },
  orders: {
    title: 'Pedidos',
    intro: 'O carrinho fica em andamento no sistema. Somente após a confirmação explícita do cliente o pedido é validado e enviado ao Bling.',
    next: ['Carrinho', 'Confirmação final', 'Criação do pedido no Bling'],
  },
  settings: {
    title: 'Configurações',
    intro: 'Integrações e parâmetros técnicos. Segredos nunca serão armazenados no frontend nem commitados no GitHub.',
    next: ['Bling', 'Make', 'Regras de segurança'],
  },
}

function StatusBadge({ status }: { status: Integration['status'] }) {
  const text = status === 'connected' ? 'Conectado' : status === 'error' ? 'Erro' : 'Pendente'
  return <span className={`status status--${status}`}>{text}</span>
}

function GenericModule({ module }: { module: ModuleId }) {
  const current = moduleCopy[module]
  return (
    <section className="panel panel--module">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Módulo</span>
          <h2>{current.title}</h2>
        </div>
      </div>
      <p className="module-intro">{current.intro}</p>
      <div className="next-grid">
        {current.next.map((item, index) => (
          <div className="next-card" key={item}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard')
  const current = useMemo(() => moduleCopy[activeModule], [activeModule])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">DA</div>
          <div>
            <strong>Dona Antônia</strong>
            <span>Admin de atendimento</span>
          </div>
        </div>

        <nav className="nav" aria-label="Navegação principal">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeModule ? 'nav-item nav-item--active' : 'nav-item'}
              onClick={() => setActiveModule(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <strong>MVP</strong>
          <span>Primeiro fazer o fluxo funcionar. Depois avançamos em recursos e automações.</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">CHAT / MVP 0.2</span>
            <h1>{current.title}</h1>
          </div>
          <span className="environment">Desenvolvimento</span>
        </header>

        {activeModule === 'dashboard' && (
          <>
            <section className="metric-grid" aria-label="Indicadores">
              {metrics.map((metric) => (
                <article className="metric-card" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.hint}</small>
                </article>
              ))}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Integrações</span>
                  <h2>Status da operação</h2>
                </div>
              </div>
              <div className="integration-list">
                {integrations.map((integration) => (
                  <div className="integration-row" key={integration.id}>
                    <div>
                      <strong>{integration.name}</strong>
                      <span>{integration.detail}</span>
                    </div>
                    <StatusBadge status={integration.status} />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {activeModule === 'products' ? <ProductsModule /> : <GenericModule module={activeModule} />}
      </main>
    </div>
  )
}

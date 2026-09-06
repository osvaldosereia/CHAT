import { FormEvent, useMemo, useState } from 'react'
import type { Basket } from '../core/types'
import { localAdminStore } from '../services/localAdminStore'

const emptyForm = {
  id: '',
  blingId: '',
  sku: '',
  name: '',
  description: '',
  salesGuidance: '',
  substitutionRules: '',
  active: true,
}

export function BasketsModule() {
  const [baskets, setBaskets] = useState<Basket[]>(() => localAdminStore.listBaskets())
  const [form, setForm] = useState(emptyForm)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    if (!normalized) return baskets
    return baskets.filter((basket) =>
      [basket.name, basket.sku ?? '', basket.blingId ?? '', basket.description]
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(normalized)),
    )
  }, [baskets, query])

  function submit(event: FormEvent) {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    const basket: Basket = {
      id: form.id || crypto.randomUUID(),
      blingId: form.blingId.trim() || undefined,
      sku: form.sku.trim() || undefined,
      name,
      description: form.description.trim(),
      salesGuidance: form.salesGuidance.trim(),
      substitutionRules: form.substitutionRules.trim(),
      active: form.active,
      items: form.id
        ? baskets.find((item) => item.id === form.id)?.items ?? []
        : [],
      updatedAt: new Date().toISOString(),
    }

    setBaskets(localAdminStore.saveBasket(basket))
    setForm(emptyForm)
  }

  function edit(basket: Basket) {
    setForm({
      id: basket.id,
      blingId: basket.blingId ?? '',
      sku: basket.sku ?? '',
      name: basket.name,
      description: basket.description,
      salesGuidance: basket.salesGuidance,
      substitutionRules: basket.substitutionRules,
      active: basket.active,
    })
  }

  function remove(id: string) {
    setBaskets(localAdminStore.deleteBasket(id))
    if (form.id === id) setForm(emptyForm)
  }

  return (
    <div className="admin-split">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Cestas / Bling</span>
            <h2>Cestas básicas</h2>
          </div>
          <span className="count-badge">{baskets.length}</span>
        </div>

        <div className="local-warning">
          <strong>Modelo correto para o MVP</strong>
          <span>O Bling continua dono do produto, preço, estoque e composição. Aqui ficam a descrição comercial e as regras que a automação precisa conhecer.</span>
        </div>

        <label className="search-field compact-search">
          <span>Buscar cesta</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, SKU ou ID Bling"
          />
        </label>

        <div className="record-list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <strong>Nenhuma cesta cadastrada.</strong>
              <span>Cadastre somente as cestas que a automação deverá apresentar e explicar ao cliente.</span>
            </div>
          ) : filtered.map((basket) => (
            <article className="record-card" key={basket.id}>
              <div className="record-card-top">
                <div>
                  <span className="category-tag">{basket.sku || 'Sem SKU vinculado'}</span>
                  <h3>{basket.name}</h3>
                </div>
                <span className={basket.active ? 'pill pill--active' : 'pill'}>
                  {basket.active ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              <p>{basket.description || 'Sem descrição comercial.'}</p>

              <dl className="mini-data-grid">
                <div>
                  <dt>ID Bling</dt>
                  <dd>{basket.blingId || 'Pendente'}</dd>
                </div>
                <div>
                  <dt>Composição</dt>
                  <dd>{basket.items.length ? `${basket.items.length} itens` : 'Virão do Bling'}</dd>
                </div>
              </dl>

              <div className="record-actions">
                <button className="button button--secondary" type="button" onClick={() => edit(basket)}>Editar</button>
                <button className="button button--danger" type="button" onClick={() => remove(basket.id)}>Excluir</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel sticky-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Editor</span>
            <h2>{form.id ? 'Editar cesta' : 'Nova cesta'}</h2>
          </div>
        </div>

        <form className="admin-form" onSubmit={submit}>
          <div className="form-grid-2">
            <label>
              <span>ID do produto no Bling</span>
              <input
                value={form.blingId}
                onChange={(event) => setForm((current) => ({ ...current, blingId: event.target.value }))}
                placeholder="Ex.: 123456789"
              />
            </label>
            <label>
              <span>SKU</span>
              <input
                value={form.sku}
                onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                placeholder="Ex.: CESTA-FAMILIA"
              />
            </label>
          </div>

          <label>
            <span>Nome da cesta</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Cesta Família"
              required
            />
          </label>

          <label>
            <span>Descrição para o cliente</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Para quem essa cesta é indicada e como apresentá-la."
            />
          </label>

          <label>
            <span>Orientação de venda para a IA</span>
            <textarea
              rows={4}
              value={form.salesGuidance}
              onChange={(event) => setForm((current) => ({ ...current, salesGuidance: event.target.value }))}
              placeholder="Ex.: quando recomendar, quais diferenças explicar e o que nunca prometer."
            />
          </label>

          <label>
            <span>Regras de substituição</span>
            <textarea
              rows={4}
              value={form.substitutionRules}
              onChange={(event) => setForm((current) => ({ ...current, substitutionRules: event.target.value }))}
              placeholder="Registre somente regras oficiais."
            />
          </label>

          <label className="check-field">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            <span>Disponível para venda no WhatsApp</span>
          </label>

          <div className="form-actions">
            {form.id && (
              <button className="button button--secondary" type="button" onClick={() => setForm(emptyForm)}>Cancelar</button>
            )}
            <button className="button button--primary" type="submit">Salvar cesta</button>
          </div>
        </form>
      </section>
    </div>
  )
}

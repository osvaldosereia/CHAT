import { FormEvent, useMemo, useState } from 'react'
import type { KnowledgeCategory, KnowledgeEntry } from '../core/types'
import { localAdminStore } from '../services/localAdminStore'

const categories: KnowledgeCategory[] = [
  'Empresa',
  'Atendimento',
  'Entregas',
  'Pagamentos',
  'Cestas',
  'Pós-venda',
]

const emptyForm = {
  id: '',
  category: 'Empresa' as KnowledgeCategory,
  title: '',
  content: '',
  active: true,
}

export function KnowledgeModule() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>(() => localAdminStore.listKnowledge())
  const [form, setForm] = useState(emptyForm)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    if (!normalized) return entries
    return entries.filter((entry) =>
      [entry.title, entry.content, entry.category]
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(normalized)),
    )
  }, [entries, query])

  function submit(event: FormEvent) {
    event.preventDefault()
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title || !content) return

    const entry: KnowledgeEntry = {
      id: form.id || crypto.randomUUID(),
      category: form.category,
      title,
      content,
      active: form.active,
      updatedAt: new Date().toISOString(),
    }

    setEntries(localAdminStore.saveKnowledge(entry))
    setForm(emptyForm)
  }

  function edit(entry: KnowledgeEntry) {
    setForm({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      content: entry.content,
      active: entry.active,
    })
  }

  function remove(id: string) {
    setEntries(localAdminStore.deleteKnowledge(id))
    if (form.id === id) setForm(emptyForm)
  }

  return (
    <div className="admin-split">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Base oficial</span>
            <h2>Conhecimento da automação</h2>
          </div>
          <span className="count-badge">{entries.length}</span>
        </div>

        <div className="local-warning">
          <strong>MVP local</strong>
          <span>As regras já podem ser cadastradas e testadas neste navegador. A persistência segura será conectada depois sem mudar este módulo.</span>
        </div>

        <label className="search-field compact-search">
          <span>Buscar regra</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Empresa, entrega, pagamento..."
          />
        </label>

        <div className="record-list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <strong>Nenhuma regra cadastrada.</strong>
              <span>Comece pelas regras da empresa, entrega, pagamento e atendimento.</span>
            </div>
          ) : filtered.map((entry) => (
            <article className="record-card" key={entry.id}>
              <div className="record-card-top">
                <div>
                  <span className="category-tag">{entry.category}</span>
                  <h3>{entry.title}</h3>
                </div>
                <span className={entry.active ? 'pill pill--active' : 'pill'}>
                  {entry.active ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <p>{entry.content}</p>
              <div className="record-actions">
                <button className="button button--secondary" type="button" onClick={() => edit(entry)}>Editar</button>
                <button className="button button--danger" type="button" onClick={() => remove(entry.id)}>Excluir</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel sticky-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Editor</span>
            <h2>{form.id ? 'Editar regra' : 'Nova regra'}</h2>
          </div>
        </div>

        <form className="admin-form" onSubmit={submit}>
          <label>
            <span>Categoria</span>
            <select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as KnowledgeCategory }))}
            >
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>

          <label>
            <span>Título</span>
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Ex.: Forma de pagamento"
              required
            />
          </label>

          <label>
            <span>Regra oficial</span>
            <textarea
              rows={8}
              value={form.content}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              placeholder="Escreva exatamente o que a automação deve considerar como verdade."
              required
            />
          </label>

          <label className="check-field">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            <span>Disponível para a automação</span>
          </label>

          <div className="form-actions">
            {form.id && (
              <button className="button button--secondary" type="button" onClick={() => setForm(emptyForm)}>Cancelar</button>
            )}
            <button className="button button--primary" type="submit">Salvar regra</button>
          </div>
        </form>
      </section>
    </div>
  )
}

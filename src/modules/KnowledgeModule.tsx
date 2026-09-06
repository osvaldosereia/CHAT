import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { KnowledgeCategory, KnowledgeEntry } from '../core/types'
import { adminRepository, getAdminRepositoryMode } from '../services/adminRepository'

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
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [form, setForm] = useState(emptyForm)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const mode = getAdminRepositoryMode()

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    adminRepository.listKnowledge()
      .then((items) => {
        if (active) setEntries(items)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar a base de conhecimento.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [mode])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    if (!normalized) return entries
    return entries.filter((entry) =>
      [entry.title, entry.content, entry.category]
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(normalized)),
    )
  }, [entries, query])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title || !content || saving) return

    const entry: KnowledgeEntry = {
      id: form.id || crypto.randomUUID(),
      category: form.category,
      title,
      content,
      active: form.active,
      updatedAt: new Date().toISOString(),
    }

    setSaving(true)
    setError('')
    try {
      setEntries(await adminRepository.saveKnowledge(entry))
      setForm(emptyForm)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar a regra.')
    } finally {
      setSaving(false)
    }
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

  async function remove(id: string) {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      setEntries(await adminRepository.deleteKnowledge(id))
      if (form.id === id) setForm(emptyForm)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao excluir a regra.')
    } finally {
      setSaving(false)
    }
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

        <div className={mode === 'make' ? 'storage-state storage-state--remote' : 'local-warning'}>
          <strong>{mode === 'make' ? 'Persistência Make' : 'MVP local'}</strong>
          <span>
            {mode === 'make'
              ? 'URL e chave da ponte estão configuradas nesta sessão. Alterações serão enviadas ao Make.'
              : 'Sem ponte configurada, as regras ficam somente neste navegador para desenvolvimento.'}
          </span>
        </div>

        {error && <div className="bridge-message bridge-message--error">{error}</div>}

        <label className="search-field compact-search">
          <span>Buscar regra</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Empresa, entrega, pagamento..."
          />
        </label>

        <div className="record-list">
          {loading ? (
            <div className="empty-state">Carregando regras…</div>
          ) : filtered.length === 0 ? (
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
                <button className="button button--secondary" type="button" disabled={saving} onClick={() => edit(entry)}>Editar</button>
                <button className="button button--danger" type="button" disabled={saving} onClick={() => remove(entry.id)}>Excluir</button>
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
              <button className="button button--secondary" type="button" disabled={saving} onClick={() => setForm(emptyForm)}>Cancelar</button>
            )}
            <button className="button button--primary" type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar regra'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

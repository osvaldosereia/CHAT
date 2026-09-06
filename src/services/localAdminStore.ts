import type { Basket, KnowledgeEntry } from '../core/types'

const KNOWLEDGE_KEY = 'chat.admin.knowledge.v1'
const BASKETS_KEY = 'chat.admin.baskets.v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function newestFirst<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const localAdminStore = {
  listKnowledge(): KnowledgeEntry[] {
    return newestFirst(readJson<KnowledgeEntry[]>(KNOWLEDGE_KEY, []))
  },

  saveKnowledge(entry: KnowledgeEntry): KnowledgeEntry[] {
    const current = readJson<KnowledgeEntry[]>(KNOWLEDGE_KEY, [])
    const next = [entry, ...current.filter((item) => item.id !== entry.id)]
    writeJson(KNOWLEDGE_KEY, next)
    return newestFirst(next)
  },

  deleteKnowledge(id: string): KnowledgeEntry[] {
    const next = readJson<KnowledgeEntry[]>(KNOWLEDGE_KEY, []).filter((item) => item.id !== id)
    writeJson(KNOWLEDGE_KEY, next)
    return newestFirst(next)
  },

  listBaskets(): Basket[] {
    return newestFirst(readJson<Basket[]>(BASKETS_KEY, []))
  },

  saveBasket(basket: Basket): Basket[] {
    const current = readJson<Basket[]>(BASKETS_KEY, [])
    const next = [basket, ...current.filter((item) => item.id !== basket.id)]
    writeJson(BASKETS_KEY, next)
    return newestFirst(next)
  },

  deleteBasket(id: string): Basket[] {
    const next = readJson<Basket[]>(BASKETS_KEY, []).filter((item) => item.id !== id)
    writeJson(BASKETS_KEY, next)
    return newestFirst(next)
  },
}

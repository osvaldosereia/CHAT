import type { Basket, KnowledgeEntry } from '../core/types'
import { localAdminStore } from './localAdminStore'
import {
  callMakeBridge,
  getAdminSessionKey,
  isBridgeConfigured,
} from './makeBridge'

type ListResponse<T> = {
  items: T[]
}

type SaveResponse<T> = {
  item: T
}

type DeleteResponse = {
  deleted: boolean
}

export type AdminRepositoryMode = 'local' | 'make'

export function getAdminRepositoryMode(): AdminRepositoryMode {
  return isBridgeConfigured() && Boolean(getAdminSessionKey()) ? 'make' : 'local'
}

function useRemote() {
  return getAdminRepositoryMode() === 'make'
}

export const adminRepository = {
  mode: getAdminRepositoryMode,

  async listKnowledge(): Promise<KnowledgeEntry[]> {
    if (!useRemote()) return localAdminStore.listKnowledge()
    const result = await callMakeBridge<ListResponse<KnowledgeEntry>>('knowledge.list')
    return Array.isArray(result?.items) ? result.items : []
  },

  async saveKnowledge(entry: KnowledgeEntry): Promise<KnowledgeEntry[]> {
    if (!useRemote()) return localAdminStore.saveKnowledge(entry)
    await callMakeBridge<SaveResponse<KnowledgeEntry>, KnowledgeEntry>('knowledge.save', entry)
    return this.listKnowledge()
  },

  async deleteKnowledge(id: string): Promise<KnowledgeEntry[]> {
    if (!useRemote()) return localAdminStore.deleteKnowledge(id)
    await callMakeBridge<DeleteResponse, { id: string }>('knowledge.delete', { id })
    return this.listKnowledge()
  },

  async listBaskets(): Promise<Basket[]> {
    if (!useRemote()) return localAdminStore.listBaskets()
    const result = await callMakeBridge<ListResponse<Basket>>('baskets.list')
    return Array.isArray(result?.items) ? result.items : []
  },

  async saveBasket(basket: Basket): Promise<Basket[]> {
    if (!useRemote()) return localAdminStore.saveBasket(basket)
    await callMakeBridge<SaveResponse<Basket>, Basket>('baskets.save', basket)
    return this.listBaskets()
  },

  async deleteBasket(id: string): Promise<Basket[]> {
    if (!useRemote()) return localAdminStore.deleteBasket(id)
    await callMakeBridge<DeleteResponse, { id: string }>('baskets.delete', { id })
    return this.listBaskets()
  },
}

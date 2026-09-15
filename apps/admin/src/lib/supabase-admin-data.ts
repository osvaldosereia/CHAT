import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDataStore, ProjectRow } from './admin-data';

export function createSupabaseAdminStore(
  client: SupabaseClient,
): AdminDataStore {
  return {
    async listProjectRows(): Promise<ProjectRow[]> {
      const { data, error } = await client
        .from('mug_projects')
        .select('id,title,status,created_at,customers(name)')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error('Não foi possível carregar os projetos');
      }

      return (data ?? []) as unknown as ProjectRow[];
    },
  };
}

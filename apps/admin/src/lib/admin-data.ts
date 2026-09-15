import type { ProjectListItem } from '../components/ProjectList';

export interface ProjectRow {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  customers: { name: string | null } | null;
}

export interface AdminDataStore {
  listProjectRows(): Promise<ProjectRow[]>;
}

export async function loadProjectList(
  store: AdminDataStore,
): Promise<ProjectListItem[]> {
  const rows = await store.listProjectRows();

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    customerName: row.customers?.name ?? null,
  }));
}

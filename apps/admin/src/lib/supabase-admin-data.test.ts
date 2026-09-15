import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminStore } from './supabase-admin-data';

describe('createSupabaseAdminStore', () => {
  it('consulta projetos com cliente e ordena pelos mais recentes', async () => {
    const rows = [
      {
        id: 'project-1',
        title: 'Caneca Ana',
        status: 'new',
        created_at: '2026-09-15T14:00:00.000Z',
        customers: { name: 'Maria' },
      },
    ];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as unknown as SupabaseClient;

    const store = createSupabaseAdminStore(client);

    await expect(store.listProjectRows()).resolves.toEqual(rows);
    expect(from).toHaveBeenCalledWith('mug_projects');
    expect(select).toHaveBeenCalledWith('id,title,status,created_at,customers(name)');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('falha com mensagem do Admin quando o Supabase retorna erro', async () => {
    const order = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });
    const client = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order }) }),
    } as unknown as SupabaseClient;

    const store = createSupabaseAdminStore(client);

    await expect(store.listProjectRows()).rejects.toThrow(
      'Não foi possível carregar os projetos',
    );
  });
});

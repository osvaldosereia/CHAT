import { describe, expect, it, vi } from 'vitest';
import { loadProjectList, type AdminDataStore } from './admin-data';

describe('loadProjectList', () => {
  it('mapeia projetos e cliente para a lista do Admin', async () => {
    const store: AdminDataStore = {
      listProjectRows: vi.fn().mockResolvedValue([
        {
          id: 'project-1',
          title: 'Caneca da Ana',
          status: 'building_briefing',
          created_at: '2026-09-15T12:00:00.000Z',
          customers: { name: 'Maria' },
        },
      ]),
    };

    await expect(loadProjectList(store)).resolves.toEqual([
      {
        id: 'project-1',
        title: 'Caneca da Ana',
        status: 'building_briefing',
        createdAt: '2026-09-15T12:00:00.000Z',
        customerName: 'Maria',
      },
    ]);
  });

  it('aceita cliente sem nome e relacao ausente', async () => {
    const store: AdminDataStore = {
      listProjectRows: vi.fn().mockResolvedValue([
        {
          id: 'project-2',
          title: null,
          status: 'new',
          created_at: '2026-09-15T13:00:00.000Z',
          customers: null,
        },
      ]),
    };

    const [project] = await loadProjectList(store);
    expect(project.customerName).toBeNull();
  });
});

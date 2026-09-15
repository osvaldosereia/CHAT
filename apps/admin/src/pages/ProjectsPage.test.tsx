import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectsPage } from './ProjectsPage';

describe('ProjectsPage', () => {
  it('mostra cliente, status e última atividade dos projetos', () => {
    const html = renderToStaticMarkup(
      <ProjectsPage
        projects={[
          {
            id: 'project-1',
            title: 'Caneca da Ana',
            customerName: 'Ana Souza',
            status: 'waiting_approval',
            createdAt: '2026-09-15T12:00:00.000Z',
          },
          {
            id: 'project-2',
            title: null,
            customerName: 'João Lima',
            status: 'building_briefing',
            createdAt: '2026-09-15T11:00:00.000Z',
          },
        ]}
        selectedProjectId={null}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('Ana Souza');
    expect(html).toContain('Aguardando aprovação');
    expect(html).toContain('João Lima');
    expect(html).toContain('15/09/2026');
  });
});

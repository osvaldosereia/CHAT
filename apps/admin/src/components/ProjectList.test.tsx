import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectList } from './ProjectList';

describe('ProjectList', () => {
  it('mostra os projetos com cliente e status', () => {
    const html = renderToStaticMarkup(
      <ProjectList
        projects={[
          {
            id: 'project-1',
            title: 'Caneca aniversário Ana',
            customerName: 'Maria',
            status: 'building_briefing',
            createdAt: '2026-09-15T12:00:00.000Z',
          },
        ]}
        selectedProjectId={null}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('Projetos');
    expect(html).toContain('Caneca aniversário Ana');
    expect(html).toContain('Maria');
    expect(html).toContain('Montando briefing');
  });

  it('mostra estado vazio de forma objetiva', () => {
    const html = renderToStaticMarkup(
      <ProjectList projects={[]} selectedProjectId={null} onSelect={() => undefined} />,
    );

    expect(html).toContain('Nenhum projeto ainda');
  });
});

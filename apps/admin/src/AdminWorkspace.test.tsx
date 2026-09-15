import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminWorkspaceView } from './AdminWorkspace';

describe('AdminWorkspaceView', () => {
  const projects = [
    {
      id: 'project-1',
      title: 'Caneca Ana',
      customerName: 'Ana Souza',
      status: 'waiting_approval',
      createdAt: '2026-09-15T12:00:00.000Z',
    },
  ];

  it('mostra navegação e detalhe do projeto selecionado', () => {
    const html = renderToStaticMarkup(
      <AdminWorkspaceView
        activeSection="projects"
        projects={projects}
        selectedProjectId="project-1"
        projectDetail={{
          id: 'project-1',
          title: 'Caneca Ana',
          status: 'waiting_approval',
          creationMode: 'reference',
          customerName: 'Ana Souza',
          customerPhone: '65999999999',
          briefing: null,
          mediaCount: 2,
          artVersion: 1,
          artUrl: 'https://signed/art',
          mockupVersion: 1,
          mockupUrl: 'https://signed/mockup',
          latestReview: 'Enviado para aprovação',
        }}
        template={null}
        loading={false}
        error={null}
        templateMessage={null}
        onNavigate={() => undefined}
        onSelectProject={() => undefined}
        onSaveTemplate={() => undefined}
        onSignOut={() => undefined}
      />,
    );

    expect(html).toContain('Projetos');
    expect(html).toContain('Gabarito');
    expect(html).toContain('Sair');
    expect(html).toContain('Caneca Ana');
    expect(html).toContain('Arte horizontal');
    expect(html).toContain('Mockup');
  });

  it('mostra a configuração do gabarito sem preencher medidas não verificadas', () => {
    const html = renderToStaticMarkup(
      <AdminWorkspaceView
        activeSection="template"
        projects={projects}
        selectedProjectId={null}
        projectDetail={null}
        template={{
          id: 'template-1',
          name: 'Caneca Tradicional Branca 350 ml',
          capacityMl: 350,
          artWidthMm: null,
          artHeightMm: null,
          aspectRatio: null,
          outputWidthPx: null,
          outputHeightPx: null,
          dpi: 300,
        }}
        loading={false}
        error={null}
        templateMessage="Gabarito salvo."
        onNavigate={() => undefined}
        onSelectProject={() => undefined}
        onSaveTemplate={() => undefined}
        onSignOut={() => undefined}
      />,
    );

    expect(html).toContain('Caneca Tradicional Branca 350 ml');
    expect(html).toContain('Gabarito salvo.');
    expect(html).toContain('Largura da arte (mm)');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectDetail } from './ProjectDetail';

describe('ProjectDetail', () => {
  it('mostra as secoes essenciais do projeto de caneca', () => {
    const html = renderToStaticMarkup(
      <ProjectDetail
        project={{
          id: 'project-1',
          title: 'Caneca para Ana',
          status: 'waiting_approval',
          creationMode: 'reference',
          customerName: 'Maria',
          customerPhone: '5565984491018',
          briefing: {
            version: 1,
            mainTheme: 'Flores e família',
            mandatoryText: ['Ana, nós te amamos'],
            readyToGenerate: true,
          },
          mediaCount: 3,
          artVersion: 1,
          artUrl: 'https://example.com/art.png',
          mockupVersion: 1,
          mockupUrl: 'https://example.com/mockup.png',
          latestReview: 'sent_for_review',
        }}
      />,
    );

    expect(html).toContain('Caneca para Ana');
    expect(html).toContain('Maria');
    expect(html).toContain('Briefing');
    expect(html).toContain('Referências');
    expect(html).toContain('Arte horizontal');
    expect(html).toContain('Mockup');
    expect(html).toContain('Ana, nós te amamos');
  });
});

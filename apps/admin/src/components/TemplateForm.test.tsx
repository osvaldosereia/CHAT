import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TemplateForm } from './TemplateForm';

describe('TemplateForm', () => {
  it('mantem dimensoes e proporcao configuraveis no Admin', () => {
    const html = renderToStaticMarkup(
      <TemplateForm
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
        saving={false}
        error={null}
        onSave={() => undefined}
      />,
    );

    expect(html).toContain('Gabarito da caneca');
    expect(html).toContain('Largura da arte');
    expect(html).toContain('Altura da arte');
    expect(html).toContain('Proporção');
    expect(html).toContain('Resolução');
    expect(html).toContain('350');
  });
});

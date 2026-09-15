import { useState, type FormEvent } from 'react';

export interface MugTemplateSettings {
  id: string;
  name: string;
  capacityMl: number | null;
  artWidthMm: number | null;
  artHeightMm: number | null;
  aspectRatio: number | null;
  outputWidthPx: number | null;
  outputHeightPx: number | null;
  dpi: number | null;
}

export interface TemplateFormProps {
  template: MugTemplateSettings;
  saving: boolean;
  error: string | null;
  onSave(template: MugTemplateSettings): void | Promise<void>;
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function TemplateForm({ template, saving, error, onSave }: TemplateFormProps) {
  const [name, setName] = useState(template.name);
  const [capacityMl, setCapacityMl] = useState(template.capacityMl?.toString() ?? '');
  const [artWidthMm, setArtWidthMm] = useState(template.artWidthMm?.toString() ?? '');
  const [artHeightMm, setArtHeightMm] = useState(template.artHeightMm?.toString() ?? '');
  const [aspectRatio, setAspectRatio] = useState(template.aspectRatio?.toString() ?? '');
  const [outputWidthPx, setOutputWidthPx] = useState(template.outputWidthPx?.toString() ?? '');
  const [outputHeightPx, setOutputHeightPx] = useState(template.outputHeightPx?.toString() ?? '');
  const [dpi, setDpi] = useState(template.dpi?.toString() ?? '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave({
      id: template.id,
      name: name.trim(),
      capacityMl: numberOrNull(capacityMl),
      artWidthMm: numberOrNull(artWidthMm),
      artHeightMm: numberOrNull(artHeightMm),
      aspectRatio: numberOrNull(aspectRatio),
      outputWidthPx: numberOrNull(outputWidthPx),
      outputHeightPx: numberOrNull(outputHeightPx),
      dpi: numberOrNull(dpi),
    });
  }

  return (
    <section className="template-card" aria-labelledby="template-title">
      <header>
        <p className="eyebrow">Produção</p>
        <h2 id="template-title">Gabarito da caneca</h2>
        <p>Configure as medidas somente quando o gabarito físico estiver confirmado.</p>
      </header>

      <form onSubmit={handleSubmit}>
        <label htmlFor="template-name">Nome</label>
        <input id="template-name" value={name} onChange={(event) => setName(event.target.value)} required />

        <label htmlFor="capacity">Capacidade (ml)</label>
        <input id="capacity" type="number" min="1" value={capacityMl} onChange={(event) => setCapacityMl(event.target.value)} />

        <label htmlFor="art-width">Largura da arte (mm)</label>
        <input id="art-width" type="number" min="0" step="0.01" value={artWidthMm} onChange={(event) => setArtWidthMm(event.target.value)} />

        <label htmlFor="art-height">Altura da arte (mm)</label>
        <input id="art-height" type="number" min="0" step="0.01" value={artHeightMm} onChange={(event) => setArtHeightMm(event.target.value)} />

        <label htmlFor="aspect-ratio">Proporção</label>
        <input id="aspect-ratio" type="number" min="0" step="0.0001" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} />

        <fieldset>
          <legend>Resolução</legend>
          <label htmlFor="output-width">Largura (px)</label>
          <input id="output-width" type="number" min="1" value={outputWidthPx} onChange={(event) => setOutputWidthPx(event.target.value)} />
          <label htmlFor="output-height">Altura (px)</label>
          <input id="output-height" type="number" min="1" value={outputHeightPx} onChange={(event) => setOutputHeightPx(event.target.value)} />
        </fieldset>

        <label htmlFor="dpi">DPI</label>
        <input id="dpi" type="number" min="1" value={dpi} onChange={(event) => setDpi(event.target.value)} />

        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar gabarito'}</button>
      </form>
    </section>
  );
}

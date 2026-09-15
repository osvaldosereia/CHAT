import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('identifica o painel como Caneca Fácil', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Caneca Fácil');
  });
});

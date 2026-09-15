import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('mostra os campos minimos de acesso ao Admin', () => {
    const html = renderToStaticMarkup(
      <LoginForm loading={false} error={null} onSubmit={() => undefined} />,
    );

    expect(html).toContain('Entrar no Caneca Fácil');
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('Entrar');
  });
});

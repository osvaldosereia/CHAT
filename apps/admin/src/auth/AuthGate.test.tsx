import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthGateView } from './AuthGate';

describe('AuthGateView', () => {
  it('mostra carregamento enquanto verifica a sessão', () => {
    const html = renderToStaticMarkup(
      <AuthGateView
        status="loading"
        loginLoading={false}
        loginError={null}
        onLogin={() => undefined}
      >
        <p>Painel protegido</p>
      </AuthGateView>,
    );

    expect(html).toContain('Verificando acesso');
    expect(html).not.toContain('Painel protegido');
  });

  it('mostra login quando não há sessão', () => {
    const html = renderToStaticMarkup(
      <AuthGateView
        status="signed-out"
        loginLoading={false}
        loginError={null}
        onLogin={() => undefined}
      >
        <p>Painel protegido</p>
      </AuthGateView>,
    );

    expect(html).toContain('Entrar no Admin');
    expect(html).not.toContain('Painel protegido');
  });

  it('libera o conteúdo quando há sessão', () => {
    const html = renderToStaticMarkup(
      <AuthGateView
        status="signed-in"
        loginLoading={false}
        loginError={null}
        onLogin={() => undefined}
      >
        <p>Painel protegido</p>
      </AuthGateView>,
    );

    expect(html).toContain('Painel protegido');
    expect(html).not.toContain('Entrar no Admin');
  });
});

import { useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LoginForm, type LoginCredentials } from '../components/LoginForm';
import { signInAdmin } from '../lib/auth';
import {
  readAdminSession,
  subscribeAdminSession,
  type AdminSessionAuthPort,
} from './session';

export type AuthGateStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthGateViewProps {
  status: AuthGateStatus;
  loginLoading: boolean;
  loginError: string | null;
  onLogin(credentials: LoginCredentials): void | Promise<void>;
  children: ReactNode;
}

export function AuthGateView({
  status,
  loginLoading,
  loginError,
  onLogin,
  children,
}: AuthGateViewProps) {
  if (status === 'loading') {
    return (
      <main className="auth-loading" aria-live="polite">
        <p>Verificando acesso…</p>
      </main>
    );
  }

  if (status === 'signed-out') {
    return (
      <div aria-label="Entrar no Admin">
        <LoginForm loading={loginLoading} error={loginError} onSubmit={onLogin} />
      </div>
    );
  }

  return <>{children}</>;
}

export interface AuthGateProps {
  client: SupabaseClient;
  children: ReactNode;
}

export function AuthGate({ client, children }: AuthGateProps) {
  const [status, setStatus] = useState<AuthGateStatus>('loading');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const auth = client.auth as unknown as AdminSessionAuthPort;

    void readAdminSession(auth)
      .then((session) => {
        if (active) setStatus(session ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (active) {
          setLoginError('Não foi possível verificar o acesso.');
          setStatus('signed-out');
        }
      });

    const stop = subscribeAdminSession(auth, (session) => {
      if (active) {
        setStatus(session ? 'signed-in' : 'signed-out');
        if (!session) setLoginLoading(false);
      }
    });

    return () => {
      active = false;
      stop();
    };
  }, [client]);

  async function handleLogin(credentials: LoginCredentials) {
    setLoginLoading(true);
    setLoginError(null);

    try {
      await signInAdmin(client.auth, credentials);
      const session = await readAdminSession(
        client.auth as unknown as AdminSessionAuthPort,
      );
      setStatus(session ? 'signed-in' : 'signed-out');
    } catch {
      setLoginError('E-mail ou senha inválidos, ou acesso não disponível.');
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <AuthGateView
      status={status}
      loginLoading={loginLoading}
      loginError={loginError}
      onLogin={handleLogin}
    >
      {children}
    </AuthGateView>
  );
}

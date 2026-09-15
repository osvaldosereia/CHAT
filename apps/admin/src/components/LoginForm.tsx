import { useState, type FormEvent } from 'react';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginFormProps {
  loading: boolean;
  error: string | null;
  onSubmit(credentials: LoginCredentials): void | Promise<void>;
}

export function LoginForm({ loading, error, onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit({ email: email.trim(), password });
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Admin</p>
        <h1 id="login-title">Entrar no Caneca Fácil</h1>
        <p>Acompanhe projetos, briefing, arte e mockup em um só lugar.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? <p role="alert">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

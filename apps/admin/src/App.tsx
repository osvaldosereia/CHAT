import type { SupabaseClient } from '@supabase/supabase-js';
import { AdminWorkspace } from './AdminWorkspace';
import { AuthGate } from './auth/AuthGate';

export interface AppProps {
  client?: SupabaseClient;
}

export function App({ client }: AppProps) {
  if (!client) {
    return (
      <main className="setup-shell">
        <h1>Caneca Fácil</h1>
        <p>Painel operacional do atendimento e criação de canecas personalizadas.</p>
        <p>Configure a conexão pública do Supabase para acessar o Admin.</p>
      </main>
    );
  }

  return (
    <AuthGate client={client}>
      <AdminWorkspace client={client} />
    </AuthGate>
  );
}

import { describe, expect, it, vi } from 'vitest';
import { signInAdmin, type AdminAuthPort } from './auth';

describe('signInAdmin', () => {
  it('envia email e senha ao Supabase Auth', async () => {
    const auth: AdminAuthPort = {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    };

    await signInAdmin(auth, { email: 'admin@canecafacil.com.br', password: 'segredo' });

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@canecafacil.com.br',
      password: 'segredo',
    });
  });

  it('transforma erro de autenticacao em erro de dominio', async () => {
    const auth: AdminAuthPort = {
      signInWithPassword: vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } }),
    };

    await expect(
      signInAdmin(auth, { email: 'admin@canecafacil.com.br', password: 'errada' }),
    ).rejects.toThrow('Não foi possível entrar no Admin');
  });
});

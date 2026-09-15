import { describe, expect, it, vi } from 'vitest';
import {
  readAdminSession,
  subscribeAdminSession,
  type AdminSessionAuthPort,
} from './session';

describe('admin session lifecycle', () => {
  it('retorna a sessão atual do Supabase', async () => {
    const auth: AdminSessionAuthPort = {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'admin-1' } } },
        error: null,
      }),
      onAuthStateChange: vi.fn(),
    };

    await expect(readAdminSession(auth)).resolves.toEqual({ user: { id: 'admin-1' } });
  });

  it('propaga mudanças de sessão e permite cancelar a assinatura', () => {
    const unsubscribe = vi.fn();
    let listener: ((event: string, session: unknown | null) => void) | undefined;
    const auth: AdminSessionAuthPort = {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn((callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
    };
    const onSession = vi.fn();

    const stop = subscribeAdminSession(auth, onSession);
    listener?.('SIGNED_IN', { user: { id: 'admin-2' } });
    listener?.('SIGNED_OUT', null);
    stop();

    expect(onSession).toHaveBeenNthCalledWith(1, { user: { id: 'admin-2' } });
    expect(onSession).toHaveBeenNthCalledWith(2, null);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

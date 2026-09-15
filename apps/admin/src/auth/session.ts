export interface AdminSessionAuthPort {
  getSession(): Promise<{
    data: { session: unknown | null };
    error: { message?: string } | null;
  }>;
  onAuthStateChange(
    callback: (event: string, session: unknown | null) => void,
  ): {
    data: {
      subscription: {
        unsubscribe(): void;
      };
    };
  };
}

export async function readAdminSession(auth: AdminSessionAuthPort): Promise<unknown | null> {
  const { data, error } = await auth.getSession();

  if (error) {
    throw new Error('Não foi possível verificar a sessão do Admin');
  }

  return data.session;
}

export function subscribeAdminSession(
  auth: AdminSessionAuthPort,
  onSession: (session: unknown | null) => void,
): () => void {
  const { data } = auth.onAuthStateChange((_event, session) => {
    onSession(session);
  });

  return () => data.subscription.unsubscribe();
}

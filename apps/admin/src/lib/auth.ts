export interface AdminCredentials {
  email: string;
  password: string;
}

export interface AdminAuthPort {
  signInWithPassword(credentials: AdminCredentials): Promise<{
    error: { message: string } | null;
  }>;
}

export async function signInAdmin(
  auth: AdminAuthPort,
  credentials: AdminCredentials,
): Promise<void> {
  const { error } = await auth.signInWithPassword(credentials);

  if (error) {
    throw new Error('Não foi possível entrar no Admin');
  }
}

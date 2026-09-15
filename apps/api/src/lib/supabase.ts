import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface ServerSupabaseConfig {
  url: string;
  secretKey: string;
}

export function createServerSupabaseClient(
  config: ServerSupabaseConfig,
): SupabaseClient {
  if (!config.url.trim() || !config.secretKey.trim()) {
    throw new Error('Invalid Supabase configuration');
  }

  return createClient(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

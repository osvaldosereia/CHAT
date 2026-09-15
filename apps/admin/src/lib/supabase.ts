import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface BrowserSupabaseConfig {
  url: string;
  publishableKey: string;
}

export function createBrowserSupabaseClient(
  config: BrowserSupabaseConfig,
): SupabaseClient {
  if (!config.url.trim() || !config.publishableKey.trim()) {
    throw new Error('Invalid Supabase configuration');
  }

  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

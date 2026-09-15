import { describe, expect, it } from 'vitest';
import { createBrowserSupabaseClient } from './supabase';

describe('browser Supabase client', () => {
  it('rejeita configuracao incompleta', () => {
    expect(() =>
      createBrowserSupabaseClient({ url: '', publishableKey: '' }),
    ).toThrow('Invalid Supabase configuration');
  });

  it('aceita somente URL e publishable key no navegador', () => {
    const client = createBrowserSupabaseClient({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_test',
    });

    expect(client).toBeDefined();
  });
});

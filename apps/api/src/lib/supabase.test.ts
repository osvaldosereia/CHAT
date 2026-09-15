import { describe, expect, it } from 'vitest';
import { createServerSupabaseClient } from './supabase';

describe('server Supabase client', () => {
  it('recusa configuração vazia', () => {
    expect(() =>
      createServerSupabaseClient({
        url: '',
        secretKey: '',
      }),
    ).toThrow(/supabase configuration/i);
  });
});

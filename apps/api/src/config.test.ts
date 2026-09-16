import { describe, expect, it } from 'vitest';
import { loadApiConfig } from './config';

const requiredEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  WHATSAPP_VERIFY_TOKEN: 'verify-test',
  WHATSAPP_ACCESS_TOKEN: 'access-test',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_GRAPH_VERSION: 'v99.0',
};

describe('loadApiConfig', () => {
  it('loads the canonical WhatsApp and Supabase server configuration', () => {
    expect(
      loadApiConfig({
        ...requiredEnv,
        WHATSAPP_APP_SECRET: 'app-secret-test',
        PORT: '4100',
      }),
    ).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseSecretKey: 'sb_secret_test',
      whatsappVerifyToken: 'verify-test',
      whatsappAccessToken: 'access-test',
      whatsappPhoneNumberId: '123456789',
      whatsappGraphVersion: 'v99.0',
      whatsappAppSecret: 'app-secret-test',
      port: 4100,
    });
  });

  it('fails fast when a required server variable is missing', () => {
    expect(() =>
      loadApiConfig({
        ...requiredEnv,
        SUPABASE_SECRET_KEY: '',
      }),
    ).toThrow('SUPABASE_SECRET_KEY');
  });

  it('requires an explicit Graph API version instead of freezing one in code', () => {
    const { WHATSAPP_GRAPH_VERSION: _removed, ...withoutGraphVersion } = requiredEnv;
    expect(() => loadApiConfig(withoutGraphVersion)).toThrow('WHATSAPP_GRAPH_VERSION');
  });

  it('does not silently use META_VERIFY_TOKEN as the verify token', () => {
    const { WHATSAPP_VERIFY_TOKEN: _removed, ...withoutCanonical } = requiredEnv;

    expect(() =>
      loadApiConfig({
        ...withoutCanonical,
        META_VERIFY_TOKEN: 'legacy-token',
      }),
    ).toThrow('WHATSAPP_VERIFY_TOKEN');
  });

  it('uses port 3000 and no app secret by default', () => {
    expect(loadApiConfig(requiredEnv)).toMatchObject({
      port: 3000,
      whatsappAppSecret: undefined,
    });
  });
});

import { serve } from '@hono/node-server';
import { createApiApp } from './app';
import { loadApiConfig } from './config';

const config = loadApiConfig(process.env);

serve({
  fetch: createApiApp(config).fetch,
  port: config.port,
});

import { serve } from '@hono/node-server';
import { createApiApp } from './app';

const port = Number(process.env.PORT ?? 3000);

serve({
  fetch: createApiApp().fetch,
  port,
});

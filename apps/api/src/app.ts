import { Hono } from 'hono';

export function createApiApp() {
  const app = new Hono();

  app.get('/health', (context) =>
    context.json({
      status: 'ok',
      service: 'caneca-facil-api',
    }),
  );

  return app;
}

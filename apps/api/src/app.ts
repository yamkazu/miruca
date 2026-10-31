import { Hono } from 'hono';

/** The HTTP API. Every route lives under /api so CloudFront can route /api/* here. */
export function createApp() {
  const app = new Hono().basePath('/api');

  app.get('/healthz', (c) => c.text('ok'));

  app.get('/hello', (c) =>
    c.json({
      message: 'Hello from Lambda Web Functions!',
      runtime: `Node.js ${process.versions.node}`,
      region: process.env.AWS_REGION ?? 'local',
      time: new Date().toISOString(),
    }),
  );

  return app;
}

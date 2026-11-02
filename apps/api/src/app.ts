import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import type { Config } from './config';
import { createStore } from './store';

/**
 * The HTTP API. Every route lives under /api so CloudFront can route /api/* here.
 * The local-only login is not here: only the local entry point adds it, so production never bundles it.
 */
export function createApp(config: Config) {
  const app = new Hono().basePath('/api');
  const store = createStore(config.aws);
  const cookie = config.sessionCookie;

  // Every state-changing request must come from miruca's own page.
  app.use(async (c, next) => {
    if (
      (c.req.method === 'POST' || c.req.method === 'DELETE') &&
      (config.appOrigin === null || c.req.header('Origin') !== config.appOrigin)
    ) {
      return c.json({ error: 'forbidden origin' }, 403);
    }
    await next();
  });

  app.get('/healthz', (c) => c.text('ok'));

  app.get('/hello', (c) =>
    c.json({
      message: 'Hello from Lambda Web Functions!',
      runtime: `Node.js ${process.versions.node}`,
      region: process.env.AWS_REGION ?? 'local',
      time: new Date().toISOString(),
    }),
  );

  app.get('/me', async (c) => {
    const sessionId = getCookie(c, cookie.name);
    const user = sessionId ? await store.userBySession(sessionId, new Date()) : null;
    if (!user) return c.json({ devLogin: config.env === 'local' }, 401);
    return c.json(user);
  });

  app.post('/auth/logout', async (c) => {
    const sessionId = getCookie(c, cookie.name);
    if (sessionId) await store.deleteSession(sessionId);
    deleteCookie(c, cookie.name, { path: '/', secure: cookie.secure });
    return c.body(null, 204);
  });

  return app;
}

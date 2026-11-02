import type { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { LocalConfig } from '../config';
import { createStore, sampleEmail } from '../store';

/** POST /api/dev/login: log in as any email without mail. Only the local entry point imports this file. */
export function addDevLogin(app: Hono, config: LocalConfig) {
  const store = createStore(config.aws);
  app.post('/dev/login', async (c) => {
    const body: unknown = await c.req.json().catch(() => ({}));
    const raw = typeof body === 'object' && body !== null && 'email' in body ? body.email : undefined;
    const email = typeof raw === 'string' && raw.trim() !== '' ? raw.trim().toLowerCase() : sampleEmail;
    if (!/^[^@\s]+@[^@\s]+$/.test(email) || email.length > 254) return c.json({ error: 'メールアドレスの形が正しくありません' }, 400);

    const user = await store.findOrCreateUserByEmail(email);
    const session = await store.createSession(user.userId, new Date());
    setCookie(c, config.sessionCookie.name, session.sessionId, {
      path: '/',
      httpOnly: true,
      secure: config.sessionCookie.secure,
      sameSite: 'Lax',
      expires: new Date(session.expiresAt),
    });
    return c.json(user);
  });
}

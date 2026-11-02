import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { productionConfig } from '../src/config';
import { createLocalApp } from '../src/local/app';
import { localConfig as config, ministackUrl } from '../src/local/config';
import { seed } from '../src/local/seed';
import { githubAppSecretName, readSecret } from '../src/secrets';

const origin = config.appOrigin;
const app = createLocalApp();

beforeAll(async () => {
  const up = await fetch(`${ministackUrl}/_ministack/health`).then(
    (r) => r.ok,
    () => false,
  );
  if (!up) throw new Error(`MiniStack (${ministackUrl}) に接続できません。先に \`npm run dev:services\` を起動してください`);
});

beforeEach(async () => {
  await fetch(`${ministackUrl}/_ministack/reset`, { method: 'POST' });
  await seed(config);
});

afterEach(() => vi.useRealTimers());

async function login(email?: string) {
  const res = await app.request('/api/dev/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(email === undefined ? {} : { email }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  return { setCookie, cookie: setCookie.split(';')[0], user: (await res.json()) as { userId: string; email: string } };
}

const me = (cookie?: string) => app.request('/api/me', { headers: cookie ? { Cookie: cookie } : {} });

describe('local-only login', () => {
  it('logs in as sample@miruca.local when the email is omitted', async () => {
    const { cookie } = await login();
    const res = await me(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'sample@miruca.local', userId: expect.any(String) });
  });

  it('logs in as the given email', async () => {
    const { cookie } = await login('other@miruca.local');
    expect(await (await me(cookie)).json()).toMatchObject({ email: 'other@miruca.local' });
  });

  it('keeps one user per email across logins', async () => {
    const first = await login('twice@miruca.local');
    const second = await login('twice@miruca.local');
    expect(second.user.userId).toBe(first.user.userId);
    expect((await login()).user.userId).not.toBe(first.user.userId);
  });

  it('issues a new session ID on every login', async () => {
    const first = await login();
    const second = await login();
    expect(second.cookie).not.toBe(first.cookie);
  });

  it('sets an HttpOnly, SameSite=Lax cookie without Secure or __Host- locally', async () => {
    const { setCookie } = await login();
    expect(setCookie).toMatch(/^miruca_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');
  });

  it('rejects a malformed email', async () => {
    const res = await app.request('/api/dev/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not an email' }),
    });
    expect(res.status).toBe(400);
  });

  it('is not registered in production', async () => {
    // Give production an origin so the Origin check passes and only route registration decides.
    const prod = createApp({ ...productionConfig, appOrigin: origin });
    const res = await prod.request('/api/dev/login', { method: 'POST', headers: { Origin: origin } });
    expect(res.status).toBe(404);
  });

  it('refuses every POST in production until it is given an origin', async () => {
    const res = await createApp(productionConfig).request('/api/auth/logout', { method: 'POST', headers: { Origin: origin } });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/me', () => {
  it('returns 401 before login and says the local-only login is available', async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ devLogin: true });
  });

  it('returns 401 for an unknown session', async () => {
    expect((await me('miruca_session=nope')).status).toBe(401);
  });

  it('returns 401 once the session is past its 14 days, even before TTL removes it', async () => {
    const { cookie } = await login();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 14 * 24 * 60 * 60 * 1000 - 60_000);
    expect((await me(cookie)).status).toBe(200);
    vi.setSystemTime(Date.now() + 2 * 60_000);
    expect((await me(cookie)).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session so the old cookie no longer works', async () => {
    const { cookie } = await login();
    const res = await app.request('/api/auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toMatch(/^miruca_session=;.*Max-Age=0/);
    expect((await me(cookie)).status).toBe(401);
  });

  it('succeeds without a session', async () => {
    const res = await app.request('/api/auth/logout', { method: 'POST', headers: { Origin: origin } });
    expect(res.status).toBe(204);
  });
});

describe('Origin check', () => {
  it.each([
    ['another site', { Origin: 'https://evil.example' }],
    ['no Origin', {} as Record<string, string>],
  ])('refuses POST from %s with 403', async (_, headers) => {
    const { cookie } = await login();
    const res = await app.request('/api/auth/logout', { method: 'POST', headers: { ...headers, Cookie: cookie } });
    expect(res.status).toBe(403);
    expect((await me(cookie)).status).toBe(200);
  });

  it('refuses DELETE from another site with 403', async () => {
    const res = await app.request('/api/me', { method: 'DELETE', headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });
});

describe('secrets', () => {
  it('reads the seeded secret from Secrets Manager', async () => {
    expect(JSON.parse(await readSecret(config.aws, githubAppSecretName))).toEqual(expect.any(Object));
  });
});

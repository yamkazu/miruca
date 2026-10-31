import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

describe('api', () => {
  const app = createApp();

  afterEach(() => vi.unstubAllEnvs());

  it('serves health', async () => {
    const res = await app.request('/api/healthz');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('says hello', async () => {
    const res = await app.request('/api/hello');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { message: string }).message).toBe('Hello from Lambda Web Functions!');
  });

  it('includes runtime, region and an ISO 8601 time in hello', async () => {
    const body = (await (await app.request('/api/hello')).json()) as { runtime: string; region: string; time: string };
    expect(body.runtime).toMatch(/^Node\.js /);
    expect(body.region).toEqual(expect.any(String));
    expect(new Date(body.time).toISOString()).toBe(body.time);
  });

  it('falls back to region "local" when AWS_REGION is unset', async () => {
    vi.stubEnv('AWS_REGION', undefined);
    const body = (await (await app.request('/api/hello')).json()) as { region: string };
    expect(body.region).toBe('local');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
  });
});

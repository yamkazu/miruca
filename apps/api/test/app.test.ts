import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

describe('api', () => {
  const app = createApp();

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

  it('returns runtime, region and an ISO 8601 time from hello', async () => {
    const body = (await (await app.request('/api/hello')).json()) as Record<string, string>;
    expect(body.runtime).toBeTypeOf('string');
    expect(body.region).toBeTypeOf('string');
    expect(new Date(body.time).toISOString()).toBe(body.time);
  });

  it('falls back to region "local" when AWS_REGION is unset', async () => {
    vi.stubEnv('AWS_REGION', undefined);
    try {
      const body = (await (await app.request('/api/hello')).json()) as { region: string };
      expect(body.region).toBe('local');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
  });
});

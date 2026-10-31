import { describe, expect, it } from 'vitest';
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
});

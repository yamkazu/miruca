import { describe, expect, it } from 'vitest';
import type { RepoSnapshot, SnapshotStore } from '@miruca/core';
import { createApp } from '../src/app';

const store = (snaps: RepoSnapshot[]): SnapshotStore => ({
  get: async () => null,
  put: async () => {},
  list: async () => snaps,
});

describe('api', () => {
  const app = createApp(store([{ repo: 'acme/app', defaultBranch: 'main', fetchedAt: '2026-10-31T00:00:00Z', pullRequests: [], releases: [] }]));

  it('serves health', async () => {
    expect((await app.request('/api/healthz')).status).toBe(200);
  });

  it('returns metrics for a range', async () => {
    const res = await app.request('/api/metrics?from=2026-10-01&to=2026-10-30');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available.repos).toEqual(['acme/app']);
    expect(body.weekly.length).toBeGreaterThan(0);
  });

  it('rejects a bad range', async () => {
    expect((await app.request('/api/metrics?from=2026-10-30&to=2026-10-01')).status).toBe(400);
  });
});

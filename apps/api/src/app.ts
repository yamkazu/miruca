import { Hono } from 'hono';
import { computeMetrics, type RepoSnapshot, type SnapshotStore, splitList } from '@miruca/core';

const DAY = 86_400_000;
const CACHE_TTL_MS = 60_000;

/** The HTTP API. Snapshots are read from the store and cached briefly in memory. */
export function createApp(store: SnapshotStore) {
  let cache: { at: number; snaps: RepoSnapshot[] } | null = null;
  const loadSnapshots = async () => {
    if (!cache || Date.now() - cache.at > CACHE_TTL_MS) cache = { at: Date.now(), snaps: await store.list() };
    return cache.snaps;
  };

  const app = new Hono().basePath('/api');

  app.get('/healthz', (c) => c.text('ok'));

  /**
   * GET /api/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD&repos=a/b,c/d&authors=x,y
   * Defaults to the last 12 weeks. `to` is inclusive.
   */
  app.get('/metrics', async (c) => {
    const now = new Date();
    const toParam = c.req.query('to');
    const fromParam = c.req.query('from');
    const to = toParam ? new Date(Date.parse(toParam) + DAY) : now;
    const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 84 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return c.json({ error: 'Invalid date range' }, 400);
    }
    if (to.getTime() - from.getTime() > 366 * DAY) return c.json({ error: 'Range must be one year or less' }, 400);

    const result = computeMetrics(await loadSnapshots(), {
      from,
      to,
      repos: splitList(c.req.query('repos')),
      authors: splitList(c.req.query('authors')),
      excludeBots: c.req.query('bots') !== 'include',
    });
    c.header('cache-control', 'private, max-age=60');
    return c.json(result);
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Internal error' }, 500);
  });

  return app;
}

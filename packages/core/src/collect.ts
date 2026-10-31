import { GitHubClient, mergeSnapshot } from './github';
import type { SnapshotStore } from './storage';

const DAY = 86_400_000;

export interface CollectOptions {
  token: string;
  store: SnapshotStore;
  /** Explicit owner/name entries. */
  repos?: string[];
  /** Users or orgs whose repositories are all collected. */
  owners?: string[];
  /** How far back the first run goes, and how long data is kept. Default 180 days. */
  lookbackDays?: number;
  /** Re-fetch overlap on incremental runs, to catch PRs updated while the last run was going. Default 1 day. */
  overlapDays?: number;
  log?: (msg: string) => void;
  now?: Date;
}

export interface CollectResult {
  repo: string;
  pullRequests: number;
  releases: number;
  error?: string;
}

/** Fetches every target repository and updates its snapshot. One failing repo does not stop the rest. */
export async function collect(opts: CollectOptions): Promise<CollectResult[]> {
  const log = opts.log ?? console.log;
  const now = opts.now ?? new Date();
  const lookback = opts.lookbackDays ?? 180;
  const overlap = opts.overlapDays ?? 1;
  const gh = new GitHubClient({ token: opts.token });
  const retainSince = new Date(now.getTime() - lookback * DAY);

  const targets = new Set(opts.repos ?? []);
  for (const owner of opts.owners ?? []) for (const r of await gh.listRepos(owner)) targets.add(r);
  if (targets.size === 0) throw new Error('No repositories configured. Set MIRUCA_REPOS or MIRUCA_OWNERS.');

  const results: CollectResult[] = [];
  for (const repo of targets) {
    try {
      const prev = await opts.store.get(repo);
      const since = prev ? new Date(Date.parse(prev.fetchedAt) - overlap * DAY) : retainSince;
      const { defaultBranch, pullRequests } = await gh.fetchPullRequests(repo, since);
      const releases = await gh.fetchReleases(repo, since);
      const snap = mergeSnapshot(
        prev,
        { repo, defaultBranch, fetchedAt: now.toISOString(), pullRequests, releases },
        retainSince,
      );
      await opts.store.put(snap);
      log(`${repo}: +${pullRequests.length} PRs, +${releases.length} releases (total ${snap.pullRequests.length} PRs)`);
      results.push({ repo, pullRequests: pullRequests.length, releases: releases.length });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      log(`${repo}: FAILED ${error}`);
      results.push({ repo, pullRequests: 0, releases: 0, error });
    }
  }
  return results;
}

export const splitList = (v: string | undefined) =>
  (v ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

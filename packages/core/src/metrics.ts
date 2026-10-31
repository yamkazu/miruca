import type { PullRequest, Release, RepoSnapshot } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export interface MetricsQuery {
  from: Date;
  to: Date;
  repos?: string[];
  authors?: string[];
  /** Exclude bot accounts (logins ending in [bot] or -bot). Default true. */
  excludeBots?: boolean;
}

/** Per-PR durations in hours. null when the event has not happened. */
export interface PrTimings {
  /** First commit -> merge. */
  leadTime: number | null;
  /** Ready for review (or opened) -> first review by someone other than the author. */
  timeToFirstReview: number | null;
  /** First review -> merge. */
  reviewToMerge: number | null;
  /** First commit -> PR opened. */
  codingTime: number | null;
}

export interface Summary {
  mergedPrs: number;
  mergedPrsPerWeek: number;
  leadTimeP50: number | null;
  timeToFirstReviewP50: number | null;
  reviewToMergeP50: number | null;
  sizeP50: number | null;
  reviewsGiven: number;
  activeContributors: number;
  deployments: number;
  deploymentsPerWeek: number;
  doraLeadTimeP50: number | null;
  changeFailureRate: number | null;
}

export interface WeeklyPoint {
  weekStart: string;
  mergedPrs: number;
  deployments: number;
  leadTimeP50: number | null;
  timeToFirstReviewP50: number | null;
  reviewToMergeP50: number | null;
}

export interface ContributorStats {
  login: string;
  mergedPrs: number;
  reviewsGiven: number;
  leadTimeP50: number | null;
  sizeP50: number | null;
}

export interface RepoStats {
  repo: string;
  mergedPrs: number;
  deployments: number;
  deploymentSource: 'releases' | 'merges';
  leadTimeP50: number | null;
}

export interface SizeBucket {
  label: 'XS' | 'S' | 'M' | 'L' | 'XL';
  max: number | null;
  count: number;
  leadTimeP50: number | null;
}

export interface SlowPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string | null;
  mergedAt: string;
  leadTime: number;
  size: number;
}

export type DoraLevel = 'elite' | 'high' | 'medium' | 'low';

export interface MetricsResult {
  query: { from: string; to: string; repos: string[]; authors: string[] };
  generatedAt: string;
  summary: Summary;
  previous: Summary;
  dora: {
    deploymentFrequency: DoraLevel | null;
    leadTime: DoraLevel | null;
    changeFailureRate: DoraLevel | null;
  };
  weekly: WeeklyPoint[];
  contributors: ContributorStats[];
  repos: RepoStats[];
  sizes: SizeBucket[];
  slowest: SlowPr[];
  available: { repos: string[]; authors: string[]; dataFrom: string | null; fetchedAt: string | null };
}

const FAILURE_LABEL = /^(hotfix|incident|revert|bug)$/i;
const REVERT_TITLE = /^revert\b/i;

export const isBot = (login: string | null) => !!login && /(\[bot\]|-bot)$/i.test(login);

export function prSize(pr: PullRequest): number {
  return pr.additions + pr.deletions;
}

export function prTimings(pr: PullRequest): PrTimings {
  const t = (iso: string | null) => (iso ? Date.parse(iso) : null);
  const opened = Date.parse(pr.createdAt);
  // A commit authored after the PR was opened (e.g. rebased) would give negative coding time; clamp to opened.
  const firstCommit = Math.min(t(pr.firstCommitAt) ?? opened, opened);
  const ready = t(pr.readyForReviewAt) ?? opened;
  const merged = t(pr.mergedAt);
  const firstReview = pr.reviews
    .filter((r) => r.submittedAt && r.author && r.author !== pr.author && r.state !== 'PENDING')
    .map((r) => Date.parse(r.submittedAt!))
    .filter((ts) => ts >= ready)
    .sort((a, b) => a - b)[0];

  const h = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? null : Math.max(0, (b - a) / HOUR);

  return {
    leadTime: h(firstCommit, merged),
    timeToFirstReview: h(ready, firstReview),
    reviewToMerge: h(firstReview, merged),
    codingTime: h(firstCommit, opened),
  };
}

export function isFailureFix(pr: PullRequest): boolean {
  return REVERT_TITLE.test(pr.title) || pr.labels.some((l) => FAILURE_LABEL.test(l));
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const median = (v: (number | null)[]) => quantile(v.filter((x): x is number => x != null), 0.5);

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  return new Date(x.getTime() - dow * DAY);
}

/** DORA benchmark bands (State of DevOps). Deployment frequency is in deploys/week, lead time in hours. */
export function doraDeployLevel(perWeek: number): DoraLevel {
  if (perWeek >= 7) return 'elite'; // on demand / multiple per day
  if (perWeek >= 1) return 'high'; // daily to weekly
  if (perWeek >= 0.25) return 'medium'; // weekly to monthly
  return 'low';
}
export function doraLeadTimeLevel(hours: number): DoraLevel {
  if (hours < 24) return 'elite';
  if (hours < 24 * 7) return 'high';
  if (hours < 24 * 30) return 'medium';
  return 'low';
}
export function doraCfrLevel(rate: number): DoraLevel {
  if (rate <= 0.05) return 'elite';
  if (rate <= 0.1) return 'high';
  if (rate <= 0.15) return 'medium';
  return 'low';
}

interface Deployment {
  repo: string;
  at: number;
}

/**
 * Deployments per repository: published releases when the repo has any in the data,
 * otherwise merges into the default branch.
 */
function deploymentsFor(snap: RepoSnapshot): { source: 'releases' | 'merges'; list: Deployment[] } {
  const releases = snap.releases.filter((r) => !r.isPrerelease);
  if (releases.length > 0) {
    return { source: 'releases', list: releases.map((r) => ({ repo: snap.repo, at: Date.parse(r.publishedAt) })) };
  }
  return {
    source: 'merges',
    list: snap.pullRequests
      .filter((p) => p.mergedAt && p.baseRef === snap.defaultBranch)
      .map((p) => ({ repo: snap.repo, at: Date.parse(p.mergedAt!) })),
  };
}

/** First commit -> the deployment that shipped it. */
function changeLeadTime(pr: PullRequest, sortedReleases: Release[] | null): number | null {
  if (!pr.mergedAt) return null;
  const start = Math.min(Date.parse(pr.firstCommitAt ?? pr.createdAt), Date.parse(pr.createdAt));
  let shippedAt = Date.parse(pr.mergedAt);
  if (sortedReleases) {
    const rel = sortedReleases.find((r) => Date.parse(r.publishedAt) >= shippedAt);
    if (!rel) return null; // merged but not released yet
    shippedAt = Date.parse(rel.publishedAt);
  }
  return Math.max(0, (shippedAt - start) / HOUR);
}

function summarize(
  snaps: RepoSnapshot[],
  q: Required<Pick<MetricsQuery, 'from' | 'to'>> & { authorSet: Set<string> | null; excludeBots: boolean },
): { summary: Summary; merged: PullRequest[]; deployments: Deployment[]; sources: Map<string, 'releases' | 'merges'> } {
  const from = q.from.getTime();
  const to = q.to.getTime();
  const inRange = (iso: string | null) => !!iso && Date.parse(iso) >= from && Date.parse(iso) < to;
  const authorOk = (login: string | null) =>
    !(q.excludeBots && isBot(login)) && (!q.authorSet || (login != null && q.authorSet.has(login)));

  const merged: PullRequest[] = [];
  const deployments: Deployment[] = [];
  const changeLeadTimes: number[] = [];
  const sources = new Map<string, 'releases' | 'merges'>();
  let reviewsGiven = 0;
  let failures = 0;
  const contributors = new Set<string>();

  for (const snap of snaps) {
    const dep = deploymentsFor(snap);
    sources.set(snap.repo, dep.source);
    deployments.push(...dep.list.filter((d) => d.at >= from && d.at < to));
    const rels =
      dep.source === 'releases'
        ? snap.releases.filter((r) => !r.isPrerelease).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
        : null;

    for (const pr of snap.pullRequests) {
      if (inRange(pr.mergedAt) && authorOk(pr.author)) {
        merged.push(pr);
        if (pr.author) contributors.add(pr.author);
        if (isFailureFix(pr)) failures++;
        const clt = changeLeadTime(pr, rels);
        if (clt != null) changeLeadTimes.push(clt);
      }
      for (const r of pr.reviews) {
        if (r.author && r.author !== pr.author && inRange(r.submittedAt) && authorOk(r.author)) {
          reviewsGiven++;
          contributors.add(r.author);
        }
      }
    }
  }

  const weeks = Math.max((to - from) / WEEK, 1 / 7);
  const timings = merged.map(prTimings);
  return {
    merged,
    deployments,
    sources,
    summary: {
      mergedPrs: merged.length,
      mergedPrsPerWeek: merged.length / weeks,
      leadTimeP50: median(timings.map((t) => t.leadTime)),
      timeToFirstReviewP50: median(timings.map((t) => t.timeToFirstReview)),
      reviewToMergeP50: median(timings.map((t) => t.reviewToMerge)),
      sizeP50: median(merged.map(prSize)),
      reviewsGiven,
      activeContributors: contributors.size,
      deployments: deployments.length,
      deploymentsPerWeek: deployments.length / weeks,
      doraLeadTimeP50: median(changeLeadTimes),
      changeFailureRate: deployments.length > 0 ? Math.min(1, failures / deployments.length) : null,
    },
  };
}

const SIZE_BUCKETS: { label: SizeBucket['label']; max: number | null }[] = [
  { label: 'XS', max: 10 },
  { label: 'S', max: 50 },
  { label: 'M', max: 250 },
  { label: 'L', max: 1000 },
  { label: 'XL', max: null },
];

export function computeMetrics(allSnaps: RepoSnapshot[], query: MetricsQuery, now = new Date()): MetricsResult {
  const repoFilter = query.repos?.length ? new Set(query.repos) : null;
  const snaps = allSnaps.filter((s) => !repoFilter || repoFilter.has(s.repo));
  const authorSet = query.authors?.length ? new Set(query.authors) : null;
  const excludeBots = query.excludeBots ?? true;

  const cur = summarize(snaps, { from: query.from, to: query.to, authorSet, excludeBots });
  const span = query.to.getTime() - query.from.getTime();
  const prev = summarize(snaps, {
    from: new Date(query.from.getTime() - span),
    to: query.from,
    authorSet,
    excludeBots,
  });

  // Weekly series
  const weekly: WeeklyPoint[] = [];
  for (let w = weekStart(query.from).getTime(); w < query.to.getTime(); w += WEEK) {
    const inWeek = (ts: number) => ts >= w && ts < w + WEEK;
    const prs = cur.merged.filter((p) => inWeek(Date.parse(p.mergedAt!)));
    const t = prs.map(prTimings);
    weekly.push({
      weekStart: new Date(w).toISOString().slice(0, 10),
      mergedPrs: prs.length,
      deployments: cur.deployments.filter((d) => inWeek(d.at)).length,
      leadTimeP50: median(t.map((x) => x.leadTime)),
      timeToFirstReviewP50: median(t.map((x) => x.timeToFirstReview)),
      reviewToMergeP50: median(t.map((x) => x.reviewToMerge)),
    });
  }

  // Contributors
  const byLogin = new Map<string, { merged: PullRequest[]; reviews: number }>();
  const entry = (l: string) => byLogin.get(l) ?? byLogin.set(l, { merged: [], reviews: 0 }).get(l)!;
  for (const pr of cur.merged) if (pr.author) entry(pr.author).merged.push(pr);
  const from = query.from.getTime();
  const to = query.to.getTime();
  for (const snap of snaps)
    for (const pr of snap.pullRequests)
      for (const r of pr.reviews) {
        if (!r.author || r.author === pr.author || !r.submittedAt) continue;
        const ts = Date.parse(r.submittedAt);
        if (ts < from || ts >= to) continue;
        if (excludeBots && isBot(r.author)) continue;
        if (authorSet && !authorSet.has(r.author)) continue;
        entry(r.author).reviews++;
      }
  const contributors: ContributorStats[] = [...byLogin.entries()]
    .map(([login, v]) => ({
      login,
      mergedPrs: v.merged.length,
      reviewsGiven: v.reviews,
      leadTimeP50: median(v.merged.map((p) => prTimings(p).leadTime)),
      sizeP50: median(v.merged.map(prSize)),
    }))
    .sort((a, b) => b.mergedPrs + b.reviewsGiven - (a.mergedPrs + a.reviewsGiven));

  // Repos
  const repos: RepoStats[] = snaps
    .map((s) => {
      const prs = cur.merged.filter((p) => p.repo === s.repo);
      return {
        repo: s.repo,
        mergedPrs: prs.length,
        deployments: cur.deployments.filter((d) => d.repo === s.repo).length,
        deploymentSource: cur.sources.get(s.repo) ?? 'merges',
        leadTimeP50: median(prs.map((p) => prTimings(p).leadTime)),
      };
    })
    .sort((a, b) => b.mergedPrs - a.mergedPrs);

  // Size distribution
  const sizes: SizeBucket[] = SIZE_BUCKETS.map((b, i) => {
    const lo = i === 0 ? -Infinity : SIZE_BUCKETS[i - 1].max!;
    const prs = cur.merged.filter((p) => {
      const s = prSize(p);
      return s > lo && (b.max == null || s <= b.max);
    });
    return { ...b, count: prs.length, leadTimeP50: median(prs.map((p) => prTimings(p).leadTime)) };
  });

  const slowest: SlowPr[] = cur.merged
    .map((p) => ({ p, lt: prTimings(p).leadTime ?? 0 }))
    .sort((a, b) => b.lt - a.lt)
    .slice(0, 10)
    .map(({ p, lt }) => ({
      repo: p.repo,
      number: p.number,
      title: p.title,
      url: p.url,
      author: p.author,
      mergedAt: p.mergedAt!,
      leadTime: lt,
      size: prSize(p),
    }));

  const s = cur.summary;
  const allAuthors = new Set<string>();
  let dataFrom: string | null = null;
  let fetchedAt: string | null = null;
  for (const snap of allSnaps) {
    if (!fetchedAt || snap.fetchedAt > fetchedAt) fetchedAt = snap.fetchedAt;
    for (const pr of snap.pullRequests) {
      if (pr.author && !isBot(pr.author)) allAuthors.add(pr.author);
      if (!dataFrom || pr.createdAt < dataFrom) dataFrom = pr.createdAt;
    }
  }

  return {
    query: {
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      repos: query.repos ?? [],
      authors: query.authors ?? [],
    },
    generatedAt: now.toISOString(),
    summary: s,
    previous: prev.summary,
    dora: {
      deploymentFrequency: s.deployments > 0 ? doraDeployLevel(s.deploymentsPerWeek) : null,
      leadTime: s.doraLeadTimeP50 != null ? doraLeadTimeLevel(s.doraLeadTimeP50) : null,
      changeFailureRate: s.changeFailureRate != null ? doraCfrLevel(s.changeFailureRate) : null,
    },
    weekly,
    contributors,
    repos,
    sizes,
    slowest,
    available: {
      repos: allSnaps.map((x) => x.repo).sort(),
      authors: [...allAuthors].sort(),
      dataFrom,
      fetchedAt,
    },
  };
}

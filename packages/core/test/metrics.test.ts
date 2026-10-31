import { describe, expect, it } from 'vitest';
import { computeMetrics, mergeSnapshot, prTimings, quantile, weekStart, type PullRequest, type RepoSnapshot } from '../src';

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  repo: 'acme/app',
  number: 1,
  title: 'Add feature',
  url: 'https://github.com/acme/app/pull/1',
  author: 'alice',
  state: 'MERGED',
  isDraft: false,
  baseRef: 'main',
  labels: [],
  createdAt: '2026-10-05T10:00:00Z',
  updatedAt: '2026-10-06T10:00:00Z',
  readyForReviewAt: null,
  mergedAt: '2026-10-06T10:00:00Z',
  closedAt: '2026-10-06T10:00:00Z',
  firstCommitAt: '2026-10-05T08:00:00Z',
  additions: 30,
  deletions: 10,
  changedFiles: 3,
  reviews: [{ author: 'bob', state: 'APPROVED', submittedAt: '2026-10-05T14:00:00Z' }],
  ...over,
});

const snap = (prs: PullRequest[], over: Partial<RepoSnapshot> = {}): RepoSnapshot => ({
  repo: 'acme/app',
  defaultBranch: 'main',
  fetchedAt: '2026-10-31T00:00:00Z',
  pullRequests: prs,
  releases: [],
  ...over,
});

describe('prTimings', () => {
  it('computes lead time, first review and review-to-merge in hours', () => {
    expect(prTimings(pr())).toEqual({ leadTime: 26, timeToFirstReview: 4, reviewToMerge: 20, codingTime: 2 });
  });

  it('ignores self reviews and starts the review clock when the draft became ready', () => {
    const t = prTimings(
      pr({
        readyForReviewAt: '2026-10-05T12:00:00Z',
        reviews: [
          { author: 'alice', state: 'COMMENTED', submittedAt: '2026-10-05T11:00:00Z' },
          { author: 'carol', state: 'COMMENTED', submittedAt: '2026-10-05T11:30:00Z' },
          { author: 'bob', state: 'APPROVED', submittedAt: '2026-10-05T13:00:00Z' },
        ],
      }),
    );
    expect(t.timeToFirstReview).toBe(1);
  });

  it('returns null for unmerged or unreviewed PRs', () => {
    const t = prTimings(pr({ mergedAt: null, reviews: [] }));
    expect(t.leadTime).toBeNull();
    expect(t.timeToFirstReview).toBeNull();
  });
});

describe('helpers', () => {
  it('quantile interpolates', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });
  it('weekStart is Monday UTC', () => {
    expect(weekStart(new Date('2026-10-31T12:00:00Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
});

describe('computeMetrics', () => {
  const range = { from: new Date('2026-10-05T00:00:00Z'), to: new Date('2026-10-19T00:00:00Z') };

  it('summarizes merged PRs and uses merges as deployments when there are no releases', () => {
    const m = computeMetrics(
      [snap([pr(), pr({ number: 2, author: 'bob', mergedAt: '2026-10-13T10:00:00Z', reviews: [] }), pr({ number: 3, mergedAt: '2026-09-01T00:00:00Z' })])],
      range,
    );
    expect(m.summary.mergedPrs).toBe(2);
    expect(m.summary.mergedPrsPerWeek).toBe(1);
    expect(m.summary.deployments).toBe(2);
    expect(m.repos[0].deploymentSource).toBe('merges');
    expect(m.weekly.map((w) => w.mergedPrs)).toEqual([1, 1]);
    expect(m.contributors.find((c) => c.login === 'bob')).toMatchObject({ mergedPrs: 1, reviewsGiven: 1 });
  });

  it('uses releases for deployments and change lead time, and counts reverts as failures', () => {
    const m = computeMetrics(
      [
        snap([pr(), pr({ number: 2, title: 'Revert "Add feature"', mergedAt: '2026-10-08T00:00:00Z' })], {
          releases: [
            { repo: 'acme/app', tagName: 'v1', publishedAt: '2026-10-07T08:00:00Z', isPrerelease: false },
            { repo: 'acme/app', tagName: 'v2', publishedAt: '2026-10-09T08:00:00Z', isPrerelease: false },
          ],
        }),
      ],
      range,
    );
    expect(m.summary.deployments).toBe(2);
    expect(m.summary.changeFailureRate).toBe(0.5);
    // PR1: first commit 10-05 08:00 -> v1 10-07 08:00 = 48h
    expect(m.summary.doraLeadTimeP50).not.toBeNull();
    expect(m.dora.deploymentFrequency).toBe('high');
  });

  it('filters by author and excludes bots', () => {
    const m = computeMetrics([snap([pr(), pr({ number: 2, author: 'dependabot[bot]' })])], { ...range, authors: ['alice'] });
    expect(m.summary.mergedPrs).toBe(1);
    expect(m.available.authors).toEqual(['alice']);
  });
});

describe('mergeSnapshot', () => {
  it('replaces updated PRs and drops data outside retention', () => {
    const prev = snap([pr({ number: 1, title: 'old' }), pr({ number: 2, updatedAt: '2025-01-01T00:00:00Z' })]);
    const merged = mergeSnapshot(
      prev,
      { repo: 'acme/app', defaultBranch: 'main', fetchedAt: '2026-11-01T00:00:00Z', pullRequests: [pr({ number: 1, title: 'new' })], releases: [] },
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(merged.pullRequests.map((p) => p.title)).toEqual(['new']);
  });
});

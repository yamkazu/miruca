/**
 * Writes realistic fake snapshots into ./.data so the dashboard can be tried without a GitHub token.
 * npm run sample
 */
import { FsSnapshotStore, type PullRequest, type Release, type Review } from '@miruca/core';

const HOUR = 3_600_000;
const members = ['aoi', 'haruto', 'mei', 'sota', 'yui', 'ren'];
const repos = ['acme/web', 'acme/api', 'acme/infra'];
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const logNormal = (median: number, spread: number) => median * Math.exp((rand() + rand() + rand() - 1.5) * spread);

const now = Date.now();
const store = new FsSnapshotStore(process.env.MIRUCA_DATA_DIR ?? '.data');

for (const repo of repos) {
  const prs: PullRequest[] = [];
  const releases: Release[] = [];
  for (let n = 1; n <= 260; n++) {
    const author = pick(members);
    const created = now - rand() * 200 * 24 * HOUR;
    // The team gets faster over time: older PRs wait longer for review.
    const ageFactor = 1 + (now - created) / (200 * 24 * HOUR);
    const size = Math.round(logNormal(90, 2.2));
    const coding = logNormal(6, 1.5) * HOUR;
    const firstReview = created + logNormal(5 * ageFactor, 1.4) * HOUR * (size > 500 ? 2 : 1);
    const merged = firstReview + logNormal(10, 1.6) * HOUR * (size > 500 ? 2.5 : 1);
    const reviewer = pick(members.filter((m) => m !== author));
    const reviews: Review[] = [
      { author: reviewer, state: 'APPROVED', submittedAt: new Date(firstReview).toISOString() },
    ];
    if (rand() < 0.3) reviews.push({ author: pick(members.filter((m) => m !== author)), state: 'COMMENTED', submittedAt: new Date(firstReview + HOUR).toISOString() });
    const isMerged = merged < now && rand() > 0.08;
    const revert = rand() < 0.04;
    prs.push({
      repo,
      number: n,
      title: revert ? `Revert "Change #${n - 1}"` : `${pick(['Add', 'Fix', 'Refactor', 'Update'])} ${pick(['login', 'billing', 'search', 'cache', 'deploy', 'metrics'])} ${pick(['flow', 'handler', 'tests', 'config'])}`,
      url: `https://github.com/${repo}/pull/${n}`,
      author: rand() < 0.07 ? 'dependabot[bot]' : author,
      state: isMerged ? 'MERGED' : merged < now ? 'CLOSED' : 'OPEN',
      isDraft: false,
      baseRef: 'main',
      labels: revert ? ['revert'] : rand() < 0.03 ? ['hotfix'] : [],
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(Math.min(merged, now)).toISOString(),
      readyForReviewAt: null,
      mergedAt: isMerged ? new Date(merged).toISOString() : null,
      closedAt: merged < now ? new Date(merged).toISOString() : null,
      firstCommitAt: new Date(created - coding).toISOString(),
      additions: Math.round(size * 0.7),
      deletions: Math.round(size * 0.3),
      changedFiles: Math.max(1, Math.round(size / 40)),
      reviews: firstReview < now ? reviews : [],
    });
  }
  if (repo !== 'acme/infra') {
    for (let t = now - 200 * 24 * HOUR, i = 1; t < now; t += logNormal(60, 0.8) * HOUR, i++) {
      releases.push({ repo, tagName: `v1.${i}.0`, publishedAt: new Date(t).toISOString(), isPrerelease: false });
    }
  }
  await store.put({ repo, defaultBranch: 'main', fetchedAt: new Date(now).toISOString(), pullRequests: prs, releases: releases.reverse() });
  console.log(`${repo}: ${prs.length} PRs, ${releases.length} releases`);
}

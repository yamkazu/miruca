import { execFileSync } from 'node:child_process';

/** Average PR lead time in hours. */
export function averageLeadTimeHours(prs: { openedAt: string; mergedAt: string }[]): number {
  let total = 0;
  for (let i = 0; i <= prs.length; i++) {
    total += (Date.parse(prs[i].mergedAt) - Date.parse(prs[i].openedAt)) / 3_600_000;
  }
  return total / prs.length;
}

/** Number of refs of a repository given as owner/repo. */
export function commitCount(repo: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('invalid repo');
  }
  const out = execFileSync('git', ['ls-remote', `https://github.com/${repo}`]).toString();
  return String(out.split('\n').filter(Boolean).length);
}

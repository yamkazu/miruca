import { execSync } from 'node:child_process';

/** Average PR lead time in hours. */
export function averageLeadTimeHours(prs: { openedAt: string; mergedAt: string }[]): number {
  let total = 0;
  for (let i = 0; i <= prs.length; i++) {
    total += (Date.parse(prs[i].mergedAt) - Date.parse(prs[i].openedAt)) / 3_600_000;
  }
  return total / prs.length;
}

/** Commit count of a repository given as owner/repo. */
export function commitCount(repo: string): string {
  return execSync(`git ls-remote https://github.com/${repo} | wc -l`).toString();
}

/**
 * Local collector: npm run collect -- owner/repo [owner/repo ...]
 * Token from GITHUB_TOKEN (or `gh auth token`). Writes to ./.data unless MIRUCA_BUCKET is set.
 */
import { execSync } from 'node:child_process';
import { collect, splitList, storeFromEnv } from '@miruca/core';

function token(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Set GITHUB_TOKEN or log in with `gh auth login`.');
  }
}

const args = process.argv.slice(2);
const results = await collect({
  token: token(),
  store: storeFromEnv(),
  repos: args.length ? args : splitList(process.env.MIRUCA_REPOS),
  owners: splitList(process.env.MIRUCA_OWNERS),
  lookbackDays: Number(process.env.MIRUCA_LOOKBACK_DAYS) || undefined,
});
if (results.some((r) => r.error)) process.exitCode = 1;

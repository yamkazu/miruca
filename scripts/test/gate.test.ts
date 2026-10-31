import { describe, expect, it } from 'vitest';
import { classifyChange, decide } from '../gate/decide.mjs';

const f = (filename: string, lines = 10) => ({ filename, additions: lines, deletions: 0 });
const clean = { tier: 'low', verdict: 'pass' as const, important: 0 };
const noSec = { findings: 0 };
const base = { fixRounds: 0, trustedAuthor: true, foreignCommits: false };

describe('classifyChange', () => {
  it('marks infra, workflows and dependencies as sensitive', () => {
    const c = classifyChange([f('infra/lib/miruca-stack.ts'), f('.github/workflows/pr.yml'), f('apps/api/package.json')]);
    expect(c.sensitive).toHaveLength(3);
  });

  it('ignores the lockfile when counting lines', () => {
    const c = classifyChange([f('package-lock.json', 5000), f('README.md', 10)]);
    expect(c.linesChanged).toBe(10);
    expect(c.tooLarge).toBe(false);
  });

  it('flags source changes without test changes', () => {
    expect(classifyChange([f('apps/api/src/app.ts')]).sourceWithoutTests).toBe(true);
    expect(classifyChange([f('apps/api/src/app.ts'), f('apps/api/test/app.test.ts')]).sourceWithoutTests).toBe(false);
    expect(classifyChange([f('README.md')]).sourceWithoutTests).toBe(false);
  });
});

describe('decide', () => {
  const docsOnly = classifyChange([f('README.md')]);

  it('auto-merges a clean low-risk change', () => {
    expect(decide({ ...base, change: docsOnly, review: clean, security: noSec }).action).toBe('automerge');
  });

  it('routes medium risk to a human under the default scope', () => {
    const r = decide({ ...base, change: docsOnly, review: { ...clean, tier: 'medium' }, security: noSec });
    expect(r).toMatchObject({ action: 'human', gatePass: true });
  });

  it('always routes sensitive paths to a human, whatever the review says', () => {
    const change = classifyChange([f('infra/lib/miruca-stack.ts'), f('infra/test/stack.test.ts')]);
    const r = decide({ ...base, change, review: clean, security: noSec, autoMergeMaxTier: 'medium' });
    expect(r).toMatchObject({ action: 'human', tier: 'high' });
  });

  it('asks the AI to fix blocking findings, up to the round cap', () => {
    const review = { ...clean, verdict: 'fix' as const, important: 2 };
    expect(decide({ ...base, change: docsOnly, review, security: noSec, fixRounds: 2 }).action).toBe('fix');
    expect(decide({ ...base, change: docsOnly, review, security: noSec, fixRounds: 3 })).toMatchObject({
      action: 'human',
      gatePass: false,
    });
  });

  it('blocks on security findings', () => {
    expect(decide({ ...base, change: docsOnly, review: clean, security: { findings: 1 } }).gatePass).toBe(false);
  });

  it('never auto-merges PRs from people or with foreign commits', () => {
    expect(decide({ ...base, change: docsOnly, review: clean, security: noSec, trustedAuthor: false }).action).toBe('human');
    expect(decide({ ...base, change: docsOnly, review: clean, security: noSec, foreignCommits: true }).action).toBe('human');
  });

  it('fails closed when a review did not finish', () => {
    expect(decide({ ...base, change: docsOnly, review: null, security: noSec })).toMatchObject({ action: 'human', gatePass: false });
  });

  it('turns auto-merge off entirely with scope none', () => {
    expect(decide({ ...base, change: docsOnly, review: clean, security: noSec, autoMergeMaxTier: 'none' }).action).toBe('human');
  });
});

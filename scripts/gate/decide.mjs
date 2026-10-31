// Pure decision logic for the quality gate. Kept free of I/O so it can be unit-tested.
// Design: risk is decided by what the change touches, not by who wrote it, and only the
// lowest tier merges without a person (see REVIEW.md and docs/ai-workflow.md).

export const TIERS = ['low', 'medium', 'high'];

/** Paths that always need a person, whatever the AI review says. */
export const SENSITIVE_RULES = [
  { test: (f) => f.startsWith('infra/'), reason: 'AWS インフラ（infra/）の変更' },
  { test: (f) => f.startsWith('.github/'), reason: 'GitHub 設定・ワークフロー（.github/）の変更' },
  { test: (f) => f.startsWith('scripts/gate/'), reason: '品質ゲート自体（scripts/gate/）の変更' },
  { test: (f) => ['CLAUDE.md', 'REVIEW.md', 'biome.json'].includes(f), reason: 'AI とレビューのルールの変更' },
  { test: (f) => f.endsWith('package.json') || f === 'package-lock.json', reason: '依存パッケージ・npm スクリプトの変更' },
];

const LOCKFILES = new Set(['package-lock.json']);
const isSource = (f) => /^apps\/[^/]+\/src\//.test(f) || /^scripts\/(?!test\/).+\.m?[jt]s$/.test(f);
const isTest = (f) => /(^|\/)test\//.test(f) || /\.test\.[mc]?[jt]sx?$/.test(f);

/**
 * @param {{ filename: string, additions: number, deletions: number }[]} files
 * @param {{ maxLines?: number }} [opts]
 */
export function classifyChange(files, { maxLines = 400 } = {}) {
  const sensitive = [];
  for (const rule of SENSITIVE_RULES) {
    if (files.some((f) => rule.test(f.filename))) sensitive.push(rule.reason);
  }
  const linesChanged = files.filter((f) => !LOCKFILES.has(f.filename)).reduce((n, f) => n + f.additions + f.deletions, 0);
  const touchesSource = files.some((f) => isSource(f.filename) && !isTest(f.filename));
  const touchesTests = files.some((f) => isTest(f.filename));
  return {
    sensitive,
    linesChanged,
    tooLarge: linesChanged > maxLines,
    sourceWithoutTests: touchesSource && !touchesTests,
  };
}

const rank = (tier) => (tier === 'none' ? -1 : TIERS.indexOf(tier));
const maxTier = (a, b) => (rank(a) >= rank(b) ? a : b);

/**
 * @param {object} input
 * @param {ReturnType<typeof classifyChange>} input.change
 * @param {{ tier: string, verdict: 'pass'|'fix'|'human', important: number, summary?: string } | null} input.review
 * @param {{ findings: number, summary?: string } | null} input.security
 * @param {number} input.fixRounds     fix requests already made on this PR
 * @param {number} [input.maxFixRounds]
 * @param {boolean} input.trustedAuthor PR opened by the implementing AI
 * @param {boolean} input.foreignCommits PR has commits the gate can't vouch for (pushed by someone else)
 * @param {'none'|'low'|'medium'|'high'} [input.autoMergeMaxTier]
 * @returns {{ action: 'automerge'|'fix'|'human', gatePass: boolean, tier: string, reasons: string[] }}
 */
export function decide({ change, review, security, fixRounds, maxFixRounds = 3, trustedAuthor, foreignCommits, autoMergeMaxTier = 'low' }) {
  if (!review || !security) {
    return { action: 'human', gatePass: false, tier: 'high', reasons: ['AI レビューまたはセキュリティレビューが完了しなかった'] };
  }

  let tier = TIERS.includes(review.tier) ? review.tier : 'high';
  if (change.sensitive.length > 0) tier = 'high';
  if (change.tooLarge) tier = maxTier(tier, 'medium');

  const blocking = [];
  if (security.findings > 0) blocking.push(`セキュリティの指摘が ${security.findings} 件`);
  if (review.important > 0) blocking.push(`Important の指摘が ${review.important} 件`);
  if (review.verdict === 'fix' && review.important === 0) blocking.push('AI レビューが修正を求めている');
  if (change.sourceWithoutTests) blocking.push('ソースを変えたのにテストの変更がない');

  if (blocking.length > 0) {
    if (trustedAuthor && fixRounds < maxFixRounds) {
      return { action: 'fix', gatePass: false, tier, reasons: [...blocking, `自動修正 ${fixRounds + 1}/${maxFixRounds} 回目`] };
    }
    const why = trustedAuthor ? `自動修正が上限（${maxFixRounds} 回）に達した` : 'AI 以外が作った PR';
    return { action: 'human', gatePass: false, tier, reasons: [...blocking, why] };
  }

  const human = [];
  if (review.verdict === 'human') human.push('AI レビューが人間の判断を求めている');
  if (!trustedAuthor) human.push('AI 以外が作った PR');
  if (foreignCommits) human.push('AI 以外のコミットが含まれる');
  human.push(...change.sensitive);
  if (change.tooLarge) human.push(`差分が大きい（${change.linesChanged} 行）`);
  if (rank(tier) > rank(autoMergeMaxTier)) human.push(`リスク「${tier}」は自動マージの対象外（上限: ${autoMergeMaxTier}）`);

  if (human.length > 0) return { action: 'human', gatePass: true, tier, reasons: [...new Set(human)] };
  return { action: 'automerge', gatePass: true, tier, reasons: ['すべての基準を満たした'] };
}

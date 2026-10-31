// Quality gate runner, called from .github/workflows/pr.yml.
//   node scripts/gate/run.mjs reset   -> a new commit arrived: drop auto-merge and the gate labels
//   node scripts/gate/run.mjs decide  -> combine CI, AI review and security review, then act on the PR
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, CI_RESULT, REVIEW_RESULT, SECURITY_RESULT,
//      AUTO_MERGE_MAX_TIER, AI_AUTHORS, AI_EMAILS, AI_BRANCH_PREFIXES, HUMAN_REVIEWER, RUN_URL,
//      GITHUB_OUTPUT, GITHUB_STEP_SUMMARY
import { appendFile } from 'node:fs/promises';
import { classifyChange, decide } from './decide.mjs';

const env = process.env;
const [owner, repo] = env.GITHUB_REPOSITORY.split('/');
const pr = Number(env.PR_NUMBER);
const list = (v, d) => (v || d).split(',').map((s) => s.trim());
const aiAuthors = list(env.AI_AUTHORS, 'claude[bot]');
// Commits from Claude in GitHub Actions (claude[bot]) and from Claude project threads (noreply@anthropic.com).
const aiEmails = list(env.AI_EMAILS, 'noreply@anthropic.com,41898282+claude[bot]@users.noreply.github.com');
// Branches only AI sessions create: `ai/` from GitHub Actions, `claude/` from Claude project threads.
const aiBranchPrefixes = list(env.AI_BRANCH_PREFIXES, 'ai/,claude/');
const GATE_MARK = '<!-- miruca-quality-gate -->';
export const FIX_MARK = '<!-- miruca-fix-request -->';
const LABELS = {
  'auto-merge': { color: '0e8a16', description: '品質ゲートを通過し自動マージ予約済み' },
  'ready-for-human': { color: 'd93f0b', description: 'Issue: 人間が実装する / PR: 人間のレビューとマージ待ち' },
};

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok && !(init.allow ?? []).includes(res.status)) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 || !res.headers.get('content-type')?.includes('json') ? null : res.json();
}

async function paginate(path) {
  const all = [];
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const items = await gh(`${path}${sep}per_page=100&page=${page}`);
    all.push(...items);
    if (items.length < 100) return all;
  }
}

async function graphql(query, variables) {
  const res = await gh('/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) });
  if (res.errors?.length) throw new Error(JSON.stringify(res.errors));
  return res.data;
}

async function ensureLabels() {
  for (const [name, meta] of Object.entries(LABELS)) {
    await gh(`/repos/${owner}/${repo}/labels`, { method: 'POST', body: JSON.stringify({ name, ...meta }), allow: [422] });
  }
}

async function setLabels(add) {
  for (const name of Object.keys(LABELS)) {
    if (name !== add)
      await gh(`/repos/${owner}/${repo}/issues/${pr}/labels/${encodeURIComponent(name)}`, { method: 'DELETE', allow: [404] });
  }
  if (add) await gh(`/repos/${owner}/${repo}/issues/${pr}/labels`, { method: 'POST', body: JSON.stringify({ labels: [add] }) });
}

async function setAutoMerge(nodeId, on) {
  const mutation = on
    ? 'mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){clientMutationId}}'
    : 'mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){clientMutationId}}';
  try {
    await graphql(mutation, { id: nodeId });
  } catch (e) {
    if (on) throw e; // disabling when it was never enabled is fine
  }
}

async function upsertGateComment(comments, body) {
  const existing = comments.find((c) => c.body?.includes(GATE_MARK));
  const payload = JSON.stringify({ body: `${GATE_MARK}\n${body}` });
  if (existing) await gh(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, { method: 'PATCH', body: payload });
  else await gh(`/repos/${owner}/${repo}/issues/${pr}/comments`, { method: 'POST', body: payload });
}

const MAX_FIX_ROUNDS = 3;

async function requestFix(fixRounds, reasons) {
  const body = [
    FIX_MARK,
    `### 品質ゲートからの修正依頼（${fixRounds + 1} 回目）`,
    '',
    ...reasons.map((r) => `- ${r}`),
    '',
    'CI の失敗と、この PR のレビューコメントを直して push してください。',
  ].join('\n');
  await gh(`/repos/${owner}/${repo}/issues/${pr}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

async function output(key, value) {
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main(mode) {
  const pull = await gh(`/repos/${owner}/${repo}/pulls/${pr}`);
  await ensureLabels();

  if (mode === 'reset') {
    await setAutoMerge(pull.node_id, false);
    await setLabels(null);
    return;
  }

  const comments = await paginate(`/repos/${owner}/${repo}/issues/${pr}/comments`);
  const fixRounds = comments.filter((c) => c.body?.includes(FIX_MARK)).length;
  const aiPr =
    aiAuthors.includes(pull.user.login) ||
    (pull.head.repo?.full_name === pull.base.repo.full_name && aiBranchPrefixes.some((p) => pull.head.ref.startsWith(p)));

  if (env.CI_RESULT !== 'success') {
    // CI is red: send it back to the AI that wrote it, within the same round cap as review findings.
    await setAutoMerge(pull.node_id, false);
    const canFix = aiPr && fixRounds < MAX_FIX_ROUNDS;
    const ciLine = `CI が通っていません（${env.CI_RESULT}）${env.RUN_URL ? `: ${env.RUN_URL}` : ''}`;
    if (canFix) {
      await setLabels(null);
      await requestFix(fixRounds, [ciLine]);
      await upsertGateComment(
        comments,
        `### 品質ゲート: AI に修正を依頼\n\n- ${ciLine}\n- 自動修正 ${fixRounds + 1}/${MAX_FIX_ROUNDS} 回目`,
      );
    } else {
      await setLabels(aiPr ? 'ready-for-human' : null);
      const why = aiPr ? `\n- 自動修正が上限（${MAX_FIX_ROUNDS} 回）に達した` : '';
      await upsertGateComment(comments, `### 品質ゲート: 判定待ち\n\n- ${ciLine}${why}\n\nCI を直すと再判定します。`);
    }
    await output('action', canFix ? 'fix' : 'none');
    process.exitCode = 1;
    return;
  }

  const files = await paginate(`/repos/${owner}/${repo}/pulls/${pr}/files`);
  const commits = await paginate(`/repos/${owner}/${repo}/pulls/${pr}/commits`);
  const change = classifyChange(files);
  // Only what can be checked mechanically: did the review jobs succeed, and how many inline comments
  // the AI left on this commit. ponytail: a review that silently skipped posting looks like "no findings".
  const prComments = await paginate(`/repos/${owner}/${repo}/pulls/${pr}/comments`);
  const aiComments = prComments.filter((c) => c.commit_id === pull.head.sha && aiAuthors.includes(c.user?.login ?? ''));
  // The review prompt makes the AI start severe findings with [critical]; those fail the gate.
  const review =
    env.REVIEW_RESULT === 'success'
      ? { comments: aiComments.length, critical: aiComments.filter((c) => /^\s*\[critical\]/i.test(c.body ?? '')).length }
      : null;
  const security = env.SECURITY_RESULT === 'success' ? {} : null;
  const isAiCommit = (c) => aiAuthors.includes(c.author?.login ?? '') || aiEmails.includes(c.commit.author?.email ?? '');
  const foreignCommits = commits.some((c) => !isAiCommit(c));

  const result = decide({
    change,
    review,
    security,
    fixRounds,
    trustedAuthor: aiPr,
    maxFixRounds: MAX_FIX_ROUNDS,
    foreignCommits,
    autoMergeMaxTier: env.AUTO_MERGE_MAX_TIER || 'low',
  });

  const title = { automerge: '自動マージ', fix: 'AI に修正を依頼', human: '人間の判断が必要' }[result.action];
  const lines = [
    `### 品質ゲート: ${title}`,
    '',
    `- リスク: **${result.tier}**（差分 ${change.linesChanged} 行）`,
    ...result.reasons.map((r) => `- ${r}`),
    '',
    `判定対象のコミット: ${pull.head.sha.slice(0, 7)}。新しいコミットが来ると判定し直します。`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  await upsertGateComment(comments, lines.join('\n'));

  if (result.action === 'automerge') {
    await setLabels('auto-merge');
    await setAutoMerge(pull.node_id, true);
  } else {
    await setAutoMerge(pull.node_id, false);
    if (result.action === 'human') {
      await setLabels('ready-for-human');
      const reviewer = env.HUMAN_REVIEWER;
      if (reviewer && reviewer !== pull.user.login) {
        await gh(`/repos/${owner}/${repo}/pulls/${pr}/requested_reviewers`, {
          method: 'POST',
          body: JSON.stringify({ reviewers: [reviewer] }),
          allow: [422],
        });
      }
    } else {
      await setLabels(null);
      await requestFix(fixRounds, result.reasons);
    }
  }

  await output('action', result.action);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  if (!result.gatePass) process.exitCode = 1;
}

await main(process.argv[2]);

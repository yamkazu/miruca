// Quality gate runner, called from .github/workflows/pr.yml.
//   node scripts/gate/run.mjs reset   -> a new commit arrived: drop auto-merge and the gate labels
//   node scripts/gate/run.mjs decide  -> combine CI, AI review and security review, then act on the PR
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, CI_RESULT, REVIEW_JSON, SECURITY_JSON,
//      AUTO_MERGE_MAX_TIER, AI_AUTHORS, HUMAN_REVIEWER, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY
import { appendFile } from 'node:fs/promises';
import { classifyChange, decide } from './decide.mjs';

const env = process.env;
const [owner, repo] = env.GITHUB_REPOSITORY.split('/');
const pr = Number(env.PR_NUMBER);
const aiAuthors = (env.AI_AUTHORS || 'claude[bot]').split(',').map((s) => s.trim());
const GATE_MARK = '<!-- miruca-quality-gate -->';
export const FIX_MARK = '<!-- miruca-fix-request -->';
const LABELS = {
  'auto-merge': { color: '0e8a16', description: '品質ゲートを通過し自動マージ予約済み' },
  'needs-human': { color: 'd93f0b', description: '人間のレビューと判断が必要' },
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

const parse = (s) => {
  try {
    const v = JSON.parse(s || '');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};

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

  if (env.CI_RESULT !== 'success') {
    await setAutoMerge(pull.node_id, false);
    await setLabels(null);
    await upsertGateComment(comments, `### 品質ゲート: 判定待ち\n\nCI が通っていません（${env.CI_RESULT}）。CI を直すと再判定します。`);
    await output('action', 'none');
    process.exitCode = 1;
    return;
  }

  const files = await paginate(`/repos/${owner}/${repo}/pulls/${pr}/files`);
  const commits = await paginate(`/repos/${owner}/${repo}/pulls/${pr}/commits`);
  const change = classifyChange(files);
  const review = parse(env.REVIEW_JSON);
  const security = parse(env.SECURITY_JSON);
  const trustedAuthor = aiAuthors.includes(pull.user.login);
  const foreignCommits = commits.some((c) => !aiAuthors.includes(c.author?.login ?? '') && !aiAuthors.includes(c.committer?.login ?? ''));
  const fixRounds = comments.filter((c) => c.body?.includes(FIX_MARK)).length;

  const result = decide({
    change,
    review,
    security,
    fixRounds,
    trustedAuthor,
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
    review?.summary ? `**AI レビュー**: ${review.summary}` : '',
    security?.summary ? `**セキュリティレビュー**: ${security.summary}` : '',
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
      await setLabels('needs-human');
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
      const body = [
        FIX_MARK,
        `### 品質ゲートからの修正依頼（${fixRounds + 1} 回目）`,
        '',
        ...result.reasons.map((r) => `- ${r}`),
        '',
        'この PR のレビューコメント（Important とセキュリティ）を直してください。',
      ].join('\n');
      await gh(`/repos/${owner}/${repo}/issues/${pr}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    }
  }

  await output('action', result.action);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  if (!result.gatePass) process.exitCode = 1;
}

await main(process.argv[2]);

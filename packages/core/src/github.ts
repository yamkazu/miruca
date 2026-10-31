import type { PullRequest, Release, RepoSnapshot, Review } from './types';

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

const PR_QUERY = /* GraphQL */ `
  query ($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef { name }
      pullRequests(first: 50, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title url state isDraft baseRefName
          createdAt updatedAt mergedAt closedAt
          additions deletions changedFiles
          author { login }
          labels(first: 20) { nodes { name } }
          commits(first: 1) { nodes { commit { authoredDate committedDate } } }
          reviews(first: 50) { nodes { author { login } state submittedAt } }
          timelineItems(itemTypes: [READY_FOR_REVIEW_EVENT], first: 1) {
            nodes { ... on ReadyForReviewEvent { createdAt } }
          }
        }
      }
    }
  }
`;

const RELEASE_QUERY = /* GraphQL */ `
  query ($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      releases(first: 100, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { tagName publishedAt isDraft isPrerelease }
      }
    }
  }
`;

const ORG_REPOS_QUERY = /* GraphQL */ `
  query ($login: String!, $cursor: String) {
    repositoryOwner(login: $login) {
      repositories(first: 100, after: $cursor, isArchived: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { nameWithOwner isFork }
      }
    }
  }
`;

export interface GitHubClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
}

export class GitHubClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GitHubClientOptions) {
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(GITHUB_GRAPHQL, {
        method: 'POST',
        headers: {
          authorization: `bearer ${this.token}`,
          'content-type': 'application/json',
          'user-agent': 'miruca',
        },
        body: JSON.stringify({ query, variables }),
      });
      // Secondary rate limits and transient errors: back off and retry a few times.
      if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 4) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt * 5;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
      if (body.errors?.length) throw new Error(`GitHub GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
      return body.data as T;
    }
  }

  /** Lists non-archived, non-fork repositories of a user or organization. */
  async listRepos(owner: string): Promise<string[]> {
    const repos: string[] = [];
    let cursor: string | null = null;
    do {
      const data: any = await this.graphql(ORG_REPOS_QUERY, { login: owner, cursor });
      const conn = data.repositoryOwner?.repositories;
      if (!conn) throw new Error(`Owner not found: ${owner}`);
      for (const n of conn.nodes) if (!n.isFork) repos.push(n.nameWithOwner);
      cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (cursor);
    return repos;
  }

  /**
   * Fetches pull requests updated after `since`, newest first.
   * PRs are ordered by updatedAt, so paging stops at the first PR older than `since`.
   */
  async fetchPullRequests(repo: string, since: Date): Promise<{ defaultBranch: string; pullRequests: PullRequest[] }> {
    const [owner, name] = splitRepo(repo);
    const pullRequests: PullRequest[] = [];
    let defaultBranch = 'main';
    let cursor: string | null = null;
    outer: do {
      const data: any = await this.graphql(PR_QUERY, { owner, name, cursor });
      const r = data.repository;
      if (!r) throw new Error(`Repository not found: ${repo}`);
      defaultBranch = r.defaultBranchRef?.name ?? defaultBranch;
      for (const n of r.pullRequests.nodes) {
        if (new Date(n.updatedAt) < since) break outer;
        pullRequests.push(normalizePullRequest(repo, n));
      }
      cursor = r.pullRequests.pageInfo.hasNextPage ? r.pullRequests.pageInfo.endCursor : null;
    } while (cursor);
    return { defaultBranch, pullRequests };
  }

  async fetchReleases(repo: string, since: Date): Promise<Release[]> {
    const [owner, name] = splitRepo(repo);
    const releases: Release[] = [];
    let cursor: string | null = null;
    outer: do {
      const data: any = await this.graphql(RELEASE_QUERY, { owner, name, cursor });
      const conn = data.repository.releases;
      for (const n of conn.nodes) {
        if (n.isDraft || !n.publishedAt) continue;
        if (new Date(n.publishedAt) < since) break outer;
        releases.push({ repo, tagName: n.tagName, publishedAt: n.publishedAt, isPrerelease: n.isPrerelease });
      }
      cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (cursor);
    return releases;
  }
}

export function normalizePullRequest(repo: string, n: any): PullRequest {
  const firstCommit = n.commits?.nodes?.[0]?.commit;
  return {
    repo,
    number: n.number,
    title: n.title,
    url: n.url,
    author: n.author?.login ?? null,
    state: n.state,
    isDraft: n.isDraft,
    baseRef: n.baseRefName,
    labels: (n.labels?.nodes ?? []).map((l: any) => l.name),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    readyForReviewAt: n.timelineItems?.nodes?.[0]?.createdAt ?? null,
    mergedAt: n.mergedAt,
    closedAt: n.closedAt,
    firstCommitAt: firstCommit?.authoredDate ?? firstCommit?.committedDate ?? null,
    additions: n.additions,
    deletions: n.deletions,
    changedFiles: n.changedFiles,
    reviews: (n.reviews?.nodes ?? []).map(
      (r: any): Review => ({ author: r.author?.login ?? null, state: r.state, submittedAt: r.submittedAt }),
    ),
  };
}

/**
 * Merges freshly fetched data into an existing snapshot.
 * Newer copies of a PR replace older ones; anything outside the retention window is dropped.
 */
export function mergeSnapshot(
  prev: RepoSnapshot | null,
  next: Omit<RepoSnapshot, 'pullRequests' | 'releases'> & { pullRequests: PullRequest[]; releases: Release[] },
  retainSince: Date,
): RepoSnapshot {
  const prs = new Map<number, PullRequest>();
  for (const pr of prev?.pullRequests ?? []) prs.set(pr.number, pr);
  for (const pr of next.pullRequests) prs.set(pr.number, pr);
  const releases = new Map<string, Release>();
  for (const r of prev?.releases ?? []) releases.set(r.tagName, r);
  for (const r of next.releases) releases.set(r.tagName, r);
  const keep = (iso: string) => new Date(iso) >= retainSince;
  return {
    repo: next.repo,
    defaultBranch: next.defaultBranch,
    fetchedAt: next.fetchedAt,
    pullRequests: [...prs.values()].filter((p) => keep(p.updatedAt)).sort((a, b) => b.number - a.number),
    releases: [...releases.values()].filter((r) => keep(r.publishedAt)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  };
}

function splitRepo(repo: string): [string, string] {
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`Invalid repo "${repo}", expected owner/name`);
  return [owner, name];
}

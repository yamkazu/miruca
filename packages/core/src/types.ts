/** A review left on a pull request. */
export interface Review {
  author: string | null;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  submittedAt: string | null;
}

/** A pull request, normalized from the GitHub API. All timestamps are ISO 8601. */
export interface PullRequest {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string | null;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  baseRef: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  /** When the PR left draft state; null if it was never a draft. */
  readyForReviewAt: string | null;
  mergedAt: string | null;
  closedAt: string | null;
  /** Authored date of the first commit; falls back to createdAt when unavailable. */
  firstCommitAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviews: Review[];
}

/** A published release, used as the deployment signal for DORA metrics. */
export interface Release {
  repo: string;
  tagName: string;
  publishedAt: string;
  isPrerelease: boolean;
}

/** Everything stored for one repository. */
export interface RepoSnapshot {
  repo: string;
  defaultBranch: string;
  fetchedAt: string;
  pullRequests: PullRequest[];
  releases: Release[];
}

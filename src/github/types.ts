/**
 * One accepted submission, captured whole before anything is pushed.
 *
 * Assembled in the content script from two LeetCode GraphQL queries — the owner-only
 * `submissionDetails` for the code, and the public `questionData` for the statement —
 * then handed to the service worker as a single self-contained unit. Self-contained on
 * purpose: once this crosses the message boundary the push path never needs to talk to
 * LeetCode again, so a queued push still drains correctly hours later with no
 * leetcode.com tab open and no session cookie.
 */
export interface CapturedSubmission {
  /** Only 'leetcode' today. Present so the repo layout can stay platform-addressed. */
  platform: 'leetcode';
  submissionId: string;
  titleSlug: string;
  /** The number users actually see ("1" for Two Sum), not the internal questionId. */
  questionFrontendId: string;
  title: string;
  /** Easy | Medium | Hard. Free-form because it is only ever displayed. */
  difficulty: string;
  tags: string[];
  /** The problem statement, as LeetCode's own HTML. Converted to Markdown later. */
  contentHtml: string;
  code: string;
  /** LeetCode's language slug — `python3`, `cpp`, `golang`. Drives the file extension. */
  lang: string;
  runtimeDisplay?: string;
  memoryDisplay?: string;
  runtimePercentile?: number;
  memoryPercentile?: number;
  /** Epoch ms of the submission. */
  solvedAt: number;
}

/** Where a problem ended up in the repo, so a re-solve updates rather than duplicates. */
export interface PushedRecord {
  /** Directory holding the problem, e.g. `leetcode/0001-two-sum`. */
  dir: string;
  /** Submission id that produced the currently committed code. */
  submissionId: string;
  pushedAt: number;
  /** Kept so the log can link straight at the commit. */
  commitSha?: string;
}

export interface PendingPush {
  submission: CapturedSubmission;
  attempts: number;
  /** Epoch ms; the queue skips anything not yet due. */
  nextAttemptAt: number;
  lastError?: string;
}

export type PushStatus = 'pushed' | 'updated' | 'failed';

export interface PushLogEntry {
  at: number;
  titleSlug: string;
  title: string;
  status: PushStatus;
  /** Error message for failures, reason for skips. */
  detail?: string;
  commitUrl?: string;
}

export interface GithubRepoRef {
  owner: string;
  name: string;
  branch: string;
}

export interface GithubUser {
  login: string;
  avatarUrl?: string;
}

/**
 * Everything the GitHub integration knows, stored under its own key.
 *
 * Deliberately NOT part of TrackerState. The settings UI exports TrackerState verbatim
 * to a plaintext file, so a token living there would ride along into every backup the
 * user shares or drops in a cloud folder. Keeping it separate also means migrate() —
 * which doubles as the import validator — never has to reason about credentials.
 */
export interface GithubState {
  token?: string;
  tokenKind?: 'oauth' | 'pat';
  /** Granted scope string, so the UI can warn when it is too narrow to write. */
  scope?: string;
  user?: GithubUser;
  repo?: GithubRepoRef;
  /** Master switch for auto-push. Connecting does not by itself start pushing. */
  enabled: boolean;
  /**
   * Submission ids already seen, newest first. The content script diffs against this
   * to decide what is new, so it must survive a worker teardown — hence storage rather
   * than an in-memory set.
   */
  seenSubmissionIds: string[];
  /** titleSlug -> where it landed. */
  pushed: Record<string, PushedRecord>;
  queue: PendingPush[];
  log: PushLogEntry[];
}

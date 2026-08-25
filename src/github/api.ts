import type { GithubRepoRef } from './types';

const API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Bad or revoked credentials. Terminal for the queue: retrying cannot fix it, so the
 * token is cleared and the user is asked to reconnect rather than watching pushes fail
 * silently forever.
 */
export class GithubAuthError extends Error {
  readonly kind = 'auth';
  constructor(detail: string) {
    super(detail);
    this.name = 'GithubAuthError';
  }
}

/**
 * The branch moved under us between reading the ref and updating it.
 *
 * Retryable, and cheaply so — the fix is to re-read the head and rebuild the tree on top
 * of it. Happens whenever anything else writes to the repo mid-push.
 */
export class GithubConflictError extends Error {
  readonly kind = 'conflict';
  constructor(detail: string) {
    super(detail);
    this.name = 'GithubConflictError';
  }
}

/** Primary or secondary rate limit. Carries how long GitHub asked us to wait. */
export class GithubRateLimitError extends Error {
  readonly kind = 'rate-limit';
  constructor(
    detail: string,
    readonly retryAfterMs: number,
  ) {
    super(detail);
    this.name = 'GithubRateLimitError';
  }
}

/** Anything else — a 404, a 5xx, a network fault. Retryable. */
export class GithubApiError extends Error {
  readonly kind = 'api';
  constructor(
    detail: string,
    readonly status?: number,
  ) {
    super(detail);
    this.name = 'GithubApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Statuses to return rather than throw on, so callers can treat 404 as "absent". */
  allowStatuses?: number[];
  accept?: string;
}

/**
 * One request to the GitHub API.
 *
 * Runs only in the service worker, where host_permissions exempts it from CORS — the
 * identical call from an extension page would be blocked. Every failure is mapped onto
 * one of the typed errors above, because the queue's retry decision depends entirely on
 * telling "try again in a minute" apart from "this will never work".
 */
export async function githubFetch(
  token: string,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: options.accept ?? 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: options.method ?? 'GET',
      headers,
      signal: controller.signal,
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new GithubApiError('request timed out');
    }
    throw new GithubApiError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }

  if (res.ok || options.allowStatuses?.includes(res.status)) return res;
  throw await toError(res);
}

async function toError(res: Response): Promise<Error> {
  const detail = await describe(res);

  if (res.status === 401) return new GithubAuthError(`GitHub rejected the token (${detail})`);

  if (res.status === 403 || res.status === 429) {
    // A 403 is overloaded: it is both "your token lacks the scope" and "you are being
    // rate limited". The headers are what separate them, and getting this wrong either
    // way is bad — clearing a good token, or retrying a permission error forever.
    const remaining = res.headers.get('x-ratelimit-remaining');
    const retryAfter = res.headers.get('retry-after');
    const reset = res.headers.get('x-ratelimit-reset');

    if (retryAfter || remaining === '0' || /rate limit|abuse|secondary/i.test(detail)) {
      return new GithubRateLimitError(`GitHub rate limit reached (${detail})`, retryAfterMs(retryAfter, reset));
    }
    return new GithubAuthError(`GitHub refused the request (${detail})`);
  }

  if (res.status === 409 || res.status === 422) {
    return new GithubConflictError(`GitHub rejected the update (${detail})`);
  }

  return new GithubApiError(`GitHub returned HTTP ${res.status} (${detail})`, res.status);
}

export function retryAfterMs(retryAfter: string | null, reset: string | null): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

  const resetAt = Number(reset);
  if (Number.isFinite(resetAt) && resetAt > 0) {
    // Header is epoch seconds. Clamp: a far-future reset should not park the queue for
    // an hour when a minute's wait usually clears a secondary limit.
    return Math.min(Math.max(resetAt * 1000 - Date.now(), 0), 60 * 60_000);
  }
  return 60_000;
}

async function describe(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body?.message ?? res.statusText;
  } catch {
    return res.statusText || 'no detail';
  }
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Account and repository
// ---------------------------------------------------------------------------

export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  /** False when the token cannot write, which is the only thing that matters here. */
  canPush: boolean;
}

/** Repos the token can actually write to, newest-touched first. */
export async function listRepos(token: string): Promise<RepoSummary[]> {
  const repos: RepoSummary[] = [];

  // Paginated deliberately rather than taking the first 100: someone with a long repo
  // list would otherwise not find the one they made for this.
  for (let page = 1; page <= 5; page++) {
    const body = await json<
      {
        name: string;
        full_name: string;
        private: boolean;
        default_branch: string;
        owner: { login: string };
        permissions?: { push?: boolean };
      }[]
    >(await githubFetch(token, `/user/repos?per_page=100&sort=pushed&page=${page}`));

    for (const repo of body) {
      repos.push({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch || 'main',
        canPush: repo.permissions?.push !== false,
      });
    }
    if (body.length < 100) break;
  }

  return repos.filter((repo) => repo.canPush);
}

export async function getRepo(token: string, owner: string, name: string): Promise<RepoSummary> {
  const body = await json<{
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    owner: { login: string };
    permissions?: { push?: boolean };
  }>(await githubFetch(token, `/repos/${owner}/${name}`));

  return {
    owner: body.owner.login,
    name: body.name,
    fullName: body.full_name,
    private: body.private,
    defaultBranch: body.default_branch || 'main',
    canPush: body.permissions?.push !== false,
  };
}

export async function createRepo(
  token: string,
  name: string,
  isPrivate: boolean,
): Promise<RepoSummary> {
  const body = await json<{
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    owner: { login: string };
  }>(
    await githubFetch(token, '/user/repos', {
      method: 'POST',
      body: {
        name,
        private: isPrivate,
        description: 'My accepted solutions, committed automatically.',
        // Without a commit there is no branch, and every Git Data call needs a ref to
        // build on. Letting GitHub seed the README is far simpler than bootstrapping an
        // empty repo by hand.
        auto_init: true,
      },
    }),
  );

  return {
    owner: body.owner.login,
    name: body.name,
    fullName: body.full_name,
    private: body.private,
    defaultBranch: body.default_branch || 'main',
    canPush: true,
  };
}

// ---------------------------------------------------------------------------
// Git data
// ---------------------------------------------------------------------------

/** Raw file text, or undefined when the path does not exist on that branch. */
export async function getFile(
  token: string,
  repo: GithubRepoRef,
  path: string,
): Promise<string | undefined> {
  const res = await githubFetch(
    token,
    `/repos/${repo.owner}/${repo.name}/contents/${encodePath(path)}?ref=${encodeURIComponent(repo.branch)}`,
    // The raw media type sidesteps base64 round-tripping and its UTF-8 pitfalls.
    { accept: 'application/vnd.github.raw', allowStatuses: [404] },
  );
  return res.status === 404 ? undefined : await res.text();
}

export interface HeadRef {
  commitSha: string;
  treeSha: string;
}

/**
 * The branch tip, or undefined when the branch does not exist yet.
 *
 * A repo with no commits has no ref at all, which the API reports as a 404 rather than
 * an empty result. Distinguishing that from a real failure is what lets the push path
 * bootstrap an empty repo instead of erroring out on it.
 */
export async function getHead(
  token: string,
  repo: GithubRepoRef,
): Promise<HeadRef | undefined> {
  const res = await githubFetch(
    token,
    `/repos/${repo.owner}/${repo.name}/git/ref/heads/${encodeURIComponent(repo.branch)}`,
    { allowStatuses: [404] },
  );
  if (res.status === 404) return undefined;

  const ref = await json<{ object: { sha: string } }>(res);
  const commit = await json<{ tree: { sha: string } }>(
    await githubFetch(token, `/repos/${repo.owner}/${repo.name}/git/commits/${ref.object.sha}`),
  );

  return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
}

export async function createBlob(
  token: string,
  repo: GithubRepoRef,
  content: string,
): Promise<string> {
  const body = await json<{ sha: string }>(
    await githubFetch(token, `/repos/${repo.owner}/${repo.name}/git/blobs`, {
      method: 'POST',
      // utf-8 rather than base64: GitHub accepts it directly, which avoids hand-rolling
      // a UTF-8-safe base64 encoder for source files full of non-ASCII characters.
      body: { content, encoding: 'utf-8' },
    }),
  );
  return body.sha;
}

export interface TreeEntry {
  path: string;
  /** A blob sha, or null to delete the path from the base tree. */
  sha: string | null;
}

export async function createTree(
  token: string,
  repo: GithubRepoRef,
  baseTree: string,
  entries: TreeEntry[],
): Promise<string> {
  const body = await json<{ sha: string }>(
    await githubFetch(token, `/repos/${repo.owner}/${repo.name}/git/trees`, {
      method: 'POST',
      body: {
        base_tree: baseTree,
        tree: entries.map((entry) => ({
          path: entry.path,
          mode: '100644',
          type: 'blob',
          sha: entry.sha,
        })),
      },
    }),
  );
  return body.sha;
}

/**
 * Writes one file through the Contents API, creating the branch if the repo is empty.
 *
 * Used only to bootstrap: the Git Data API needs an existing ref to build a tree on, and
 * a repo with no commits has none. Every real push goes through the tree path instead,
 * so that a problem's several files land as one commit rather than several.
 */
export async function putFile(
  token: string,
  repo: GithubRepoRef,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  await githubFetch(token, `/repos/${repo.owner}/${repo.name}/contents/${encodePath(path)}`, {
    method: 'PUT',
    body: { message, content: toBase64(content), branch: repo.branch },
  });
}

/** The Contents API takes base64 only, and btoa alone mangles anything non-ASCII. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface CommitResult {
  sha: string;
  htmlUrl: string;
}

export async function createCommit(
  token: string,
  repo: GithubRepoRef,
  message: string,
  treeSha: string,
  parentSha: string,
): Promise<CommitResult> {
  const body = await json<{ sha: string; html_url?: string }>(
    await githubFetch(token, `/repos/${repo.owner}/${repo.name}/git/commits`, {
      method: 'POST',
      body: { message, tree: treeSha, parents: [parentSha] },
    }),
  );

  return {
    sha: body.sha,
    htmlUrl: body.html_url ?? `https://github.com/${repo.owner}/${repo.name}/commit/${body.sha}`,
  };
}

/**
 * Moves the branch to a new commit.
 *
 * Never forced. A rejected non-fast-forward means someone else pushed while we were
 * building the tree, and the correct answer is to rebuild on the new head — not to
 * overwrite whatever they did.
 */
export async function updateRef(
  token: string,
  repo: GithubRepoRef,
  commitSha: string,
): Promise<void> {
  await githubFetch(
    token,
    `/repos/${repo.owner}/${repo.name}/git/refs/heads/${encodeURIComponent(repo.branch)}`,
    { method: 'PATCH', body: { sha: commitSha, force: false } },
  );
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

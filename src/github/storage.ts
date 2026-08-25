import type { GithubState, PushLogEntry } from './types';

/**
 * Its own storage key, separate from `tracker`.
 *
 * The settings page exports the whole `tracker` blob to a plaintext download, so a token
 * stored there would leak into every backup. This separation is the enforcement, not a
 * convention — there is no code path that can serialize one into the other.
 */
const KEY = 'github';

/** Enough to cover the 20-item recent window many times over without unbounded growth. */
const MAX_SEEN_IDS = 500;

/** The push log is a debugging aid and an activity feed, not an archive. */
const MAX_LOG_ENTRIES = 100;

export function defaultGithubState(): GithubState {
  return {
    // Connecting an account and pushing are separate decisions: a fresh connection is
    // inert until the user turns auto-push on.
    enabled: false,
    seenSubmissionIds: [],
    pushed: {},
    queue: [],
    log: [],
  };
}

/**
 * Normalizes whatever is in storage into a usable state.
 *
 * Tolerant rather than strict for the same reason migrate() is: this blob accumulates
 * a user's push history, and throwing on an unexpected shape would strand it.
 */
export function normalize(raw: unknown): GithubState {
  const base = defaultGithubState();
  if (!raw || typeof raw !== 'object') return base;

  const state = raw as Partial<GithubState>;
  return {
    ...base,
    ...(typeof state.token === 'string' && { token: state.token }),
    ...(state.tokenKind === 'oauth' || state.tokenKind === 'pat'
      ? { tokenKind: state.tokenKind }
      : {}),
    ...(typeof state.scope === 'string' && { scope: state.scope }),
    ...(state.user?.login && { user: state.user }),
    ...(state.repo?.owner &&
      state.repo.name && {
        repo: { ...state.repo, branch: state.repo.branch || 'main' },
      }),
    enabled: state.enabled === true,
    seenSubmissionIds: Array.isArray(state.seenSubmissionIds)
      ? state.seenSubmissionIds.filter((id): id is string => typeof id === 'string')
      : [],
    pushed: state.pushed && typeof state.pushed === 'object' ? state.pushed : {},
    queue: Array.isArray(state.queue) ? state.queue : [],
    log: Array.isArray(state.log) ? state.log : [],
  };
}

export async function readGithubState(): Promise<GithubState> {
  const bag = await chrome.storage.local.get(KEY);
  return normalize(bag[KEY]);
}

/**
 * Read-modify-write, mirroring storage/repo.ts.
 *
 * The same reasoning applies here and then some: the content script appends seen ids
 * while the queue drains and the settings UI toggles switches, so a mutation built from
 * a stale read would drop whichever landed first.
 */
export async function updateGithubState(
  mutate: (state: GithubState) => GithubState | void,
): Promise<GithubState> {
  const current = await readGithubState();
  const next = mutate(current) ?? current;
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/** Whether there is a token and a repo — i.e. a push could actually be attempted. */
export function isConnected(state: GithubState): boolean {
  return Boolean(state.token && state.repo?.owner && state.repo.name);
}

/** Connected, and the user has actually asked for solutions to be pushed. */
export function isPushEnabled(state: GithubState): boolean {
  return isConnected(state) && state.enabled;
}

export function rememberSeen(state: GithubState, ids: string[]): void {
  // Newest first, de-duplicated, then trimmed — so the window never grows without bound
  // even for someone submitting all day.
  state.seenSubmissionIds = [...new Set([...ids, ...state.seenSubmissionIds])].slice(
    0,
    MAX_SEEN_IDS,
  );
}

export function appendLog(state: GithubState, entry: PushLogEntry): void {
  state.log = [entry, ...state.log].slice(0, MAX_LOG_ENTRIES);
}

/**
 * Forgets the account and everything derived from it, keeping the push log.
 *
 * The log is deliberately kept: it is the user's own record of what was sent where, and
 * disconnecting is not a request to erase that history. `pushed` is cleared because it
 * describes one specific repo — keeping it would make a later connection to a different
 * repo silently skip every problem as "already pushed".
 */
export function clearConnection(state: GithubState): void {
  delete state.token;
  delete state.tokenKind;
  delete state.scope;
  delete state.user;
  delete state.repo;
  state.enabled = false;
  state.pushed = {};
  state.queue = [];
}

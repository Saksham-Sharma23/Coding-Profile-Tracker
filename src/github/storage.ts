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
 * Serialized read-modify-write, mirroring storage/repo.ts.
 *
 * The same reasoning applies here and then some: the content script appends seen ids
 * while the queue drains and the settings UI toggles switches. Re-reading inside the
 * callback does not make that safe on its own — both the read and the write are async
 * and the whole blob is replaced, so overlapping mutations lose whichever landed first.
 * A dropped `seenSubmissionIds` entry means the same submission is captured and pushed
 * twice; a dropped queue write means a solution is never pushed at all.
 *
 * The tail of this chain is the lock. See `updateState` in storage/repo.ts.
 */
let queue: Promise<unknown> = Promise.resolve();

export async function updateGithubState(
  mutate: (state: GithubState) => GithubState | void,
): Promise<GithubState> {
  // Chained regardless of outcome, so one failure cannot wedge every later mutation.
  const run = queue.then(async () => {
    const current = await readGithubState();
    const next = mutate(current) ?? current;
    await chrome.storage.local.set({ [KEY]: next });
    return next;
  });

  queue = run.catch(() => undefined);
  return run;
}

/**
 * Whether an account is linked. Says nothing about whether a repo has been chosen.
 *
 * This is the one the UI must branch on. Gating the settings UI on isConnected() instead
 * deadlocks: that needs a repo, the repo is chosen in the picker, and the picker only
 * renders once "connected" — so a freshly authorised account can never reach it.
 */
export function hasAccount(state: GithubState): boolean {
  return Boolean(state.token);
}

/**
 * Whether a push could actually be attempted: an account *and* somewhere to push to.
 *
 * Push-readiness, not sign-in state. See hasAccount() for the latter.
 */
export function isConnected(state: GithubState): boolean {
  return Boolean(state.token && state.repo?.owner && state.repo.name);
}

/** Connected, and the user has actually asked for solutions to be pushed. */
export function isPushEnabled(state: GithubState): boolean {
  return isConnected(state) && state.enabled;
}

/**
 * Un-remembers a submission id, so the content script offers it again.
 *
 * The counterpart to `rememberSeen`. An id is marked seen the moment it is queued, which
 * is right for capture — a capture that died mid-flight is never acknowledged and gets
 * offered again. But it is wrong once a *push* gives up: the item leaves the queue while
 * the id stays in this window, so `requestNewIds` filters it out forever and the
 * solution can never be pushed again, however many times the user reconnects. Re-solving
 * the problem was the only recovery, and nothing said so.
 */
export function forgetSeen(state: GithubState, id: string): void {
  state.seenSubmissionIds = state.seenSubmissionIds.filter((each) => each !== id);
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

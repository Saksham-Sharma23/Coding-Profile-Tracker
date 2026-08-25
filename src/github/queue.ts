import { GithubAuthError, GithubConflictError, GithubRateLimitError } from './api';
import { pushSubmission } from './commit';
import { appendLog, isPushEnabled, readGithubState, updateGithubState } from './storage';
import type { CapturedSubmission, GithubState, PendingPush } from './types';

/** Give up after this many tries and record a visible failure rather than looping. */
export const MAX_ATTEMPTS = 6;

/**
 * Backoff schedule in ms, indexed by attempts already made.
 *
 * Front-loaded because most failures are transient (a dropped connection, a 502) and
 * clear within a minute; the long tail exists so a sustained outage does not burn the
 * rate limit. A conflict skips this entirely — see classify().
 */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];

/**
 * Spacing between consecutive pushes.
 *
 * GitHub's secondary rate limit asks for no more than one content-creating request per
 * second and no concurrent writes to the same repo. A push is five such calls, so this
 * gap sits between whole problems — enough to keep a backlog draining politely.
 */
const PUSH_GAP_MS = 1_200;

/**
 * Guards against two drains running at once.
 *
 * Concurrent drains would race on the same branch ref and produce nothing but 409s.
 * Module scope is the right lifetime: it lives exactly as long as the worker, and a
 * worker teardown mid-drain leaves the queue in storage to be picked up by the next one.
 */
let draining: Promise<void> | undefined;

export async function enqueue(submission: CapturedSubmission): Promise<void> {
  await updateGithubState((state) => {
    // Re-solving before the first push drains should replace the pending item, not
    // queue a second commit for the same problem.
    const queue = state.queue.filter(
      (item) => item.submission.titleSlug !== submission.titleSlug,
    );
    queue.push({ submission, attempts: 0, nextAttemptAt: 0 });
    state.queue = queue;
  });
}

/**
 * Pushes everything due, one problem at a time.
 *
 * Serial on purpose: each push reads the branch head and moves it, so parallelism here
 * would mean every commit after the first racing a ref that has already moved.
 */
export async function drainQueue(): Promise<void> {
  draining ??= run().finally(() => {
    draining = undefined;
  });
  return draining;
}

async function run(): Promise<void> {
  let state = await readGithubState();
  if (!isPushEnabled(state) || !state.queue.length) return;

  const token = state.token;
  const repo = state.repo;
  if (!token || !repo) return;

  let first = true;

  while (true) {
    state = await readGithubState();
    if (!isPushEnabled(state)) return;

    const item = nextDue(state, Date.now());
    if (!item) return;

    if (!first) await sleep(PUSH_GAP_MS);
    first = false;

    try {
      const result = await pushSubmission(token, repo, item.submission);
      await updateGithubState((current) => {
        current.queue = current.queue.filter(
          (each) => each.submission.submissionId !== item.submission.submissionId,
        );
        current.pushed[item.submission.titleSlug] = result.record;
        appendLog(current, {
          at: Date.now(),
          titleSlug: item.submission.titleSlug,
          title: item.submission.title,
          status: result.status,
          commitUrl: result.commitUrl,
        });
      });
    } catch (err) {
      const stop = await recordFailure(item, err);
      // Auth failures and rate limits are conditions, not per-item problems — nothing
      // else in the queue can succeed until they clear, so stop rather than burn every
      // remaining item's attempts against the same wall.
      if (stop) return;
    }
  }
}

/**
 * Files a failed attempt and reports whether the whole drain should stop.
 */
async function recordFailure(item: PendingPush, err: unknown): Promise<boolean> {
  const { message, waitMs, fatal, terminal } = classify(err);

  await updateGithubState((state) => {
    const pending = state.queue.find(
      (each) => each.submission.submissionId === item.submission.submissionId,
    );

    // `waitMs: undefined` means "no opinion" — fall back to the escalating schedule,
    // which needs the attempt count and so can only be resolved here.
    const wait = waitMs ?? backoffFor(pending?.attempts ?? 0);

    if (terminal) {
      // The token is gone or was refused. Keep the work queued — reconnecting should
      // resume it — but drop the credentials so the UI can say what happened.
      delete state.token;
      delete state.tokenKind;
      delete state.scope;
      state.enabled = false;
    }

    if (pending) {
      pending.attempts += 1;
      pending.lastError = message;
      pending.nextAttemptAt = Date.now() + wait;

      if (pending.attempts >= MAX_ATTEMPTS && !terminal) {
        state.queue = state.queue.filter((each) => each !== pending);
        appendLog(state, {
          at: Date.now(),
          titleSlug: item.submission.titleSlug,
          title: item.submission.title,
          status: 'failed',
          detail: `Gave up after ${MAX_ATTEMPTS} attempts: ${message}`,
        });
        return;
      }
    }

    if (terminal) {
      appendLog(state, {
        at: Date.now(),
        titleSlug: item.submission.titleSlug,
        title: item.submission.title,
        status: 'failed',
        detail: message,
      });
    }
  });

  return fatal;
}

interface Classified {
  message: string;
  /** How long to wait, or undefined to use the escalating backoff schedule. */
  waitMs?: number;
  /** Stop the current drain — nothing else will succeed right now either. */
  fatal: boolean;
  /** The connection itself is broken; clear the token. */
  terminal: boolean;
}

export function classify(err: unknown): Classified {
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof GithubAuthError) {
    return { message, waitMs: 0, fatal: true, terminal: true };
  }

  if (err instanceof GithubRateLimitError) {
    // GitHub said exactly how long to wait; anything shorter earns a longer ban.
    return { message, waitMs: err.retryAfterMs, fatal: true, terminal: false };
  }

  if (err instanceof GithubConflictError) {
    // Someone else moved the branch. Rebuilding on the new head is the fix and it costs
    // one more round trip, so retry promptly instead of backing off for a minute.
    return { message, waitMs: 2_000, fatal: false, terminal: false };
  }

  return { message, fatal: false, terminal: false };
}

/** The oldest item that is due now. */
function nextDue(state: GithubState, now: number): PendingPush | undefined {
  return state.queue
    .filter((item) => item.nextAttemptAt <= now)
    .sort((a, b) => a.submission.solvedAt - b.submission.solvedAt)[0];
}

/**
 * When the queue next needs attention, so the caller can arm an alarm.
 *
 * Returns undefined for an empty queue and 0 for work that is already due — the
 * difference between "arm nothing" and "run immediately".
 */
export function nextDueAt(state: GithubState): number | undefined {
  if (!state.queue.length) return undefined;
  return Math.min(...state.queue.map((item) => item.nextAttemptAt));
}

/** Backoff for an item that has already failed `attempts` times. */
export function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 60_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

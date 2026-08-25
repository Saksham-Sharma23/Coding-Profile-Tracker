import {
  buildCapturedSubmission,
  GRAPHQL_ENDPOINT,
  parseQuestionData,
  parseRecentAc,
  parseSubmissionDetails,
  QUESTION_DATA_QUERY,
  RECENT_AC_LIMIT,
  RECENT_AC_QUERY,
  SUBMISSION_DETAILS_QUERY,
  type QuestionDataResponse,
  type RecentAcResponse,
  type SubmissionDetailsResponse,
} from '@/platforms/leetcode-submission';
import type { CaptureConfig, CaptureRequest, Message } from '@/background/messages';

/**
 * Captures accepted submissions for the GitHub push.
 *
 * Runs alongside leetcode.ts on leetcode.com, and does nothing whatsoever unless the
 * user has connected GitHub and turned pushing on — the first thing it does is ask the
 * service worker, and an unconfigured extension stops there having made no requests.
 *
 * Deliberately no DOM interception. An earlier design patched window.fetch in the MAIN
 * world to watch for the submission response; this instead reads LeetCode's own
 * "recent accepted submissions" list, which is a documented, stable, public query. The
 * cost is that capture is poll-driven rather than instant; the benefit is that a LeetCode
 * UI redesign cannot break it, and nothing is injected into the page.
 *
 * Every request here is same-origin, which is what makes the owner-only submissionDetails
 * query work: the page's session cookie rides along automatically. The same call from the
 * service worker would be anonymous and return null.
 */

/** Slow, because the URL-change trigger is what catches a fresh submit promptly. */
const HEARTBEAT_MS = 60_000;

/** How soon after a URL change to look, letting the submission register server-side. */
const URL_CHANGE_DELAY_MS = 2_500;

/** Ids that failed to capture in this page's lifetime, so a bad one is not retried forever. */
const failed = new Set<string>();

let handle: string | undefined;
let enabled = false;
let running = false;
let lastUrl = location.href;

void start();

async function start(): Promise<void> {
  const config = await ask<CaptureConfig>({ type: 'github-capture-ready' });
  if (!config || config.type !== 'capture-config' || !config.enabled || !config.handle) return;

  enabled = true;
  handle = config.handle;

  void sweep(true);
  setInterval(() => void sweep(), HEARTBEAT_MS);
  watchUrl();

  /*
   * Submitting and immediately switching tabs — to watch the commit land, say — is the
   * normal way to use this. The heartbeat skips hidden tabs, so without this the capture
   * waited for the user to come back AND for up to a minute more. Returning to the tab is
   * itself a good moment to look.
   */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void sweep(true);
  });
}

/**
 * LeetCode is a single-page app: submitting navigates to
 * /problems/<slug>/submissions/<id>/ without a page load, so there is no event to hook.
 * Polling location is crude but total — it catches every route change however it happened.
 */
function watchUrl(): void {
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    // A submission is not immediately queryable at the moment the URL flips.
    // Forced: a submission often navigates just as the user switches away to watch.
    setTimeout(() => void sweep(true), URL_CHANGE_DELAY_MS);
  }, 1_000);
}

/**
 * One pass: find newly accepted submissions, capture each, hand them to the worker.
 *
 * `force` runs even on a hidden tab. The visibility check exists only to stop the idle
 * heartbeat polling in the background — it must never suppress a sweep that something
 * actually happened to trigger, such as a submission navigating the page.
 */
async function sweep(force = false): Promise<void> {
  if (!enabled || !handle || running) return;
  if (!force && document.hidden) return;
  running = true;

  try {
    const recent = parseRecentAc(
      await graphql<RecentAcResponse>(RECENT_AC_QUERY, { u: handle, limit: RECENT_AC_LIMIT }),
    );
    if (!recent.length) return;

    const request = await ask<CaptureRequest>({
      type: 'leetcode-recent-ac',
      entries: recent.map((entry) => entry.id),
    });
    if (!request || request.type !== 'capture-request' || !request.ids.length) return;

    for (const id of request.ids) {
      if (failed.has(id)) continue;
      try {
        await capture(id);
      } catch {
        // One bad submission must not stop the rest of the sweep. Recorded so it is not
        // retried every heartbeat for as long as this tab stays open.
        failed.add(id);
      }
    }
  } catch {
    // Logged out, offline, or LeetCode changed the query. Nothing to do but wait for the
    // next sweep — this runs on a timer and has no user waiting on it.
  } finally {
    running = false;
  }
}

async function capture(submissionId: string): Promise<void> {
  const details = parseSubmissionDetails(
    await graphql<SubmissionDetailsResponse>(SUBMISSION_DETAILS_QUERY, {
      id: Number(submissionId),
    }),
  );
  // Not ours, not accepted, or premium-gated. Nothing to push.
  if (!details) throw new Error('submission details unavailable');

  // The statement is a nice-to-have: a failure here still commits the code, with the
  // README linking out to LeetCode instead of embedding the problem.
  const question = await graphql<QuestionDataResponse>(QUESTION_DATA_QUERY, {
    titleSlug: details.titleSlug,
  })
    .then(parseQuestionData)
    .catch(() => undefined);

  await ask({
    type: 'submission-captured',
    payload: buildCapturedSubmission(submissionId, details, question),
  });
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const csrf = csrfToken();
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // LeetCode rejects unauthenticated-looking POSTs; the CSRF token is what marks
      // this as a request from the signed-in session rather than a bare cross-site post.
      ...(csrf && { 'x-csrftoken': csrf }),
    },
    // Same-origin, so the session cookie is attached and submissionDetails resolves.
    credentials: 'same-origin',
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`LeetCode returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

function csrfToken(): string | undefined {
  return /(?:^|;\s*)csrftoken=([^;]+)/.exec(document.cookie)?.[1];
}

/** sendMessage rejects when no receiver is listening; a dead worker is not an error here. */
async function ask<T>(message: Message): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return undefined;
  }
}

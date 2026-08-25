import { createRepo, getRepo, listRepos, type RepoSummary } from '@/github/api';
import { canWriteRepos, inspectToken, pollForToken, startDeviceFlow } from '@/github/auth';
import { readManifest } from '@/github/commit';
import { pushedFromManifest } from '@/github/manifest';
import { drainQueue, enqueue, nextDueAt } from '@/github/queue';
import {
  clearConnection,
  isPushEnabled,
  readGithubState,
  rememberSeen,
  updateGithubState,
} from '@/github/storage';
import type { CapturedSubmission, PushedRecord } from '@/github/types';
import { mergeSolved, readState, updateState } from '@/storage/repo';
import type { CaptureConfig, CaptureRequest, DeviceFlowEvent, Message, Response } from './messages';

/** Fires when a queued push has backed off and is due again. */
export const GITHUB_ALARM = 'github-queue';

/**
 * Routes every GitHub- and capture-related message.
 *
 * Returns undefined for anything it does not own, so the main listener can fall through
 * to its own switch.
 */
export async function handleGithubMessage(message: Message): Promise<Response | undefined> {
  switch (message.type) {
    case 'github-capture-ready':
      return await captureConfig();

    case 'leetcode-recent-ac':
      return await requestNewIds(message.entries);

    case 'submission-captured':
      await acceptSubmission(message.payload);
      return { type: 'ack' };

    case 'github-connect-pat':
      return await connectWithToken(message.token, 'pat');

    case 'github-disconnect':
      await updateGithubState(clearConnection);
      return { type: 'ack' };

    case 'github-list-repos':
      return await withToken(async (token) => ({
        type: 'github-repos',
        repos: await listRepos(token),
      }));

    case 'github-create-repo':
      return await withToken(async (token) => {
        const repo = await createRepo(token, message.name, message.private);
        await saveRepo(token, repo);
        return { type: 'github-result', ok: true };
      });

    case 'github-set-repo':
      return await withToken(async (token) => {
        const repo = await getRepo(token, message.owner, message.name);
        if (!repo.canPush) {
          return { type: 'github-result', ok: false, error: 'You cannot push to that repository.' };
        }
        await saveRepo(token, { ...repo, defaultBranch: message.branch || repo.defaultBranch });
        return { type: 'github-result', ok: true };
      });

    case 'github-set-enabled':
      await updateGithubState((state) => {
        state.enabled = message.enabled;
      });
      // Turning it on should drain anything that queued while it was off.
      if (message.enabled) void runQueue();
      return { type: 'ack' };

    case 'github-retry-queue':
      await updateGithubState((state) => {
        // An explicit "try now" overrides every backoff — the user is watching.
        for (const item of state.queue) item.nextAttemptAt = 0;
      });
      void runQueue();
      return { type: 'ack' };

    default:
      return undefined;
  }
}

/**
 * Tells the content script whether to do anything at all.
 *
 * The handle comes from tracker settings rather than the page, so capture follows the
 * account the user actually confirmed — a shared machine or a second logged-in profile
 * cannot quietly start committing someone else's work to their repo.
 */
async function captureConfig(): Promise<CaptureConfig> {
  const github = await readGithubState();
  if (!isPushEnabled(github)) return { type: 'capture-config', enabled: false };

  const handle = (await readState()).settings.handles.leetcode?.trim();
  if (!handle) return { type: 'capture-config', enabled: false };

  return { type: 'capture-config', enabled: true, handle };
}

/** Which of the ids on the page we have not already dealt with. */
async function requestNewIds(ids: string[]): Promise<CaptureRequest> {
  const state = await readGithubState();
  if (!isPushEnabled(state)) return { type: 'capture-request', ids: [] };

  const seen = new Set(state.seenSubmissionIds);
  const queued = new Set(state.queue.map((item) => item.submission.submissionId));

  return { type: 'capture-request', ids: ids.filter((id) => !seen.has(id) && !queued.has(id)) };
}

/**
 * Takes a captured submission: queue it, remember it, and enrich the tracker's own list.
 *
 * Marking the id seen here rather than when it was handed out matters — a capture that
 * failed mid-flight is never acknowledged, so the next sweep offers it again.
 */
async function acceptSubmission(payload: CapturedSubmission): Promise<void> {
  const state = await readGithubState();
  if (!isPushEnabled(state)) return;

  if (state.seenSubmissionIds.includes(payload.submissionId)) return;

  await enqueue(payload);
  await updateGithubState((current) => {
    rememberSeen(current, [payload.submissionId]);
  });

  await enrichSolvedProblem(payload);
  void runQueue();
}

/**
 * Backfills difficulty and topic tags onto the tracker's own solved list.
 *
 * The profile adapter cannot get these — LeetCode's recentAcSubmissionList carries only
 * a title and a slug, which is why every LeetCode problem in the dashboard has shown a
 * blank difficulty. The capture path already fetched the question to write the README,
 * so this costs nothing extra and quietly fixes a long-standing gap.
 */
async function enrichSolvedProblem(payload: CapturedSubmission): Promise<void> {
  if (!payload.difficulty && !payload.tags.length) return;

  await updateState((state) => {
    mergeSolved(state, 'leetcode', [
      {
        key: payload.titleSlug,
        name: payload.title,
        url: `https://leetcode.com/problems/${payload.titleSlug}/`,
        solvedAt: payload.solvedAt,
        ...(payload.difficulty && { difficulty: payload.difficulty }),
        ...(payload.tags.length && { tags: payload.tags }),
      },
    ]);
  });
}

async function connectWithToken(
  token: string,
  kind: 'oauth' | 'pat',
  scopeFromFlow?: string,
): Promise<Response> {
  const trimmed = token.trim();
  if (!trimmed) return { type: 'github-result', ok: false, error: 'Paste a token first.' };

  try {
    const info = await inspectToken(trimmed);
    const scope = scopeFromFlow ?? info.scope;

    if (!canWriteRepos(scope)) {
      return {
        type: 'github-result',
        ok: false,
        error: `That token cannot write to repositories (scopes: ${scope || 'none'}). It needs "repo" or "public_repo".`,
      };
    }

    await updateGithubState((state) => {
      state.token = trimmed;
      state.tokenKind = kind;
      state.user = info.user;
      if (scope !== undefined) state.scope = scope;
      else delete state.scope;
    });

    return { type: 'github-result', ok: true };
  } catch (err) {
    return { type: 'github-result', ok: false, error: describe(err) };
  }
}

/**
 * Points the integration at a repository and learns what is already in it.
 *
 * The repo's own `.tracker/manifest.json` is the source of truth for what has been
 * pushed, so reading it here means a reinstall, a second machine, or simply re-picking
 * the same repo carries on from where the tree actually is rather than from an empty
 * local map.
 */
async function saveRepo(token: string, repo: RepoSummary): Promise<void> {
  const ref = { owner: repo.owner, name: repo.name, branch: repo.defaultBranch };

  // A brand-new or manifest-less repo simply yields nothing; a network failure here must
  // not block choosing the repo, so it degrades to an empty map.
  let pushed: Record<string, PushedRecord> = {};
  try {
    pushed = pushedFromManifest(await readManifest(token, ref));
  } catch {
    pushed = {};
  }

  await updateGithubState((state) => {
    state.repo = ref;
    // Replaced wholesale rather than merged: the previous map described a different tree,
    // and keeping it would make problems that are not in this repo look already done.
    state.pushed = pushed;
  });
}

/** Runs an operation that needs a token, mapping the "not connected" case to an error. */
async function withToken(
  operation: (token: string) => Promise<Response>,
): Promise<Response> {
  const { token } = await readGithubState();
  if (!token) return { type: 'github-result', ok: false, error: 'Connect a GitHub account first.' };

  try {
    return await operation(token);
  } catch (err) {
    return { type: 'github-result', ok: false, error: describe(err) };
  }
}

/**
 * Drains the queue, then arms an alarm if anything is still waiting.
 *
 * The alarm is what makes a backed-off retry survive the worker being torn down, which
 * it will be long before a fifteen-minute backoff elapses.
 */
export async function runQueue(): Promise<void> {
  await drainQueue();
  await scheduleQueueRetry();
}

export async function scheduleQueueRetry(): Promise<void> {
  const due = nextDueAt(await readGithubState());
  if (due === undefined) {
    await chrome.alarms.clear(GITHUB_ALARM);
    return;
  }

  // Chrome clamps alarms to 30s minimum in a packed extension, so a shorter backoff
  // simply fires at 30s. Nothing depends on sub-minute precision here.
  chrome.alarms.create(GITHUB_ALARM, { when: Math.max(due, Date.now() + 1_000) });
}

/**
 * Device Flow, driven over a port so the poll outlives the worker's idle timeout.
 *
 * The port is the lifetime: while the settings page holds it open the worker stays
 * alive, and the moment that page closes the AbortController ends the poll rather than
 * leaving it running against GitHub with nobody to receive the result.
 */
export function handleDeviceFlowPort(port: chrome.runtime.Port): void {
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener((message: { type: string; scope?: string }) => {
    if (message?.type !== 'start') return;
    void run(message.scope ?? 'public_repo');
  });

  const send = (event: DeviceFlowEvent) => {
    try {
      port.postMessage(event);
    } catch {
      // The page closed between the await and here. The abort listener handles the rest.
    }
  };

  async function run(scope: string): Promise<void> {
    try {
      const grant = await startDeviceFlow(scope);
      send({
        type: 'code',
        userCode: grant.userCode,
        verificationUri: grant.verificationUri,
        expiresAt: grant.expiresAt,
      });

      const { token, scope: granted } = await pollForToken(grant, controller.signal);
      const result = await connectWithToken(token, 'oauth', granted);

      if (result.type === 'github-result' && result.ok) {
        const { user } = await readGithubState();
        send({ type: 'connected', login: user?.login ?? 'GitHub' });
      } else {
        send({
          type: 'failed',
          error: result.type === 'github-result' ? (result.error ?? 'Connection failed') : 'Connection failed',
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) send({ type: 'failed', error: describe(err) });
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

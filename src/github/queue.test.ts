import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChromeStorage } from '@/test/chrome-storage';
import { GithubAuthError, GithubConflictError, GithubRateLimitError } from './api';
import type { CapturedSubmission } from './types';

// Mocked so the queue's control flow can be tested without any network or DOM. The
// commit builder has its own coverage through repo-layout, manifest and render.
const pushSubmission = vi.hoisted(() => vi.fn());
vi.mock('./commit', () => ({ pushSubmission }));

const { backoffFor, classify, drainQueue, enqueue, MAX_ATTEMPTS, nextDueAt } = await import(
  './queue'
);
const { readGithubState, updateGithubState } = await import('./storage');

function submission(slug = 'two-sum', id = '1'): CapturedSubmission {
  return {
    platform: 'leetcode',
    submissionId: id,
    titleSlug: slug,
    questionFrontendId: '1',
    title: 'Two Sum',
    difficulty: 'Easy',
    tags: [],
    contentHtml: '',
    code: 'x',
    lang: 'python3',
    solvedAt: 1_000,
  };
}

async function connect(): Promise<void> {
  await updateGithubState((state) => {
    state.token = 't';
    state.repo = { owner: 'o', name: 'r', branch: 'main' };
    state.enabled = true;
  });
}

beforeEach(() => {
  mockChromeStorage();
  pushSubmission.mockReset();
  pushSubmission.mockResolvedValue({
    status: 'pushed',
    record: { dir: 'leetcode/0001-two-sum', submissionId: '1', pushedAt: 1 },
    commitUrl: 'https://github.com/o/r/commit/abc',
  });
});

describe('enqueue', () => {
  it('queues a submission', async () => {
    await enqueue(submission());
    expect((await readGithubState()).queue).toHaveLength(1);
  });

  it('replaces a pending item for the same problem rather than queueing twice', async () => {
    // Re-solving before the first push drains should produce one commit, not two.
    await enqueue(submission('two-sum', '1'));
    await enqueue(submission('two-sum', '2'));

    const { queue } = await readGithubState();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.submission.submissionId).toBe('2');
  });
});

describe('drainQueue', () => {
  it('pushes a queued submission and records it', async () => {
    await connect();
    await enqueue(submission());
    await drainQueue();

    const state = await readGithubState();
    expect(pushSubmission).toHaveBeenCalledTimes(1);
    expect(state.queue).toHaveLength(0);
    expect(state.pushed['two-sum']).toMatchObject({ dir: 'leetcode/0001-two-sum' });
    expect(state.log[0]).toMatchObject({ status: 'pushed', titleSlug: 'two-sum' });
  });

  it('does nothing while pushing is switched off', async () => {
    await enqueue(submission());
    await drainQueue();

    expect(pushSubmission).not.toHaveBeenCalled();
    expect((await readGithubState()).queue).toHaveLength(1);
  });

  it('pushes one problem at a time, never concurrently', async () => {
    // Parallel pushes would race the same branch ref and produce nothing but conflicts.
    let inFlight = 0;
    let maxInFlight = 0;
    pushSubmission.mockImplementation(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return {
        status: 'pushed',
        record: { dir: 'd', submissionId: '1', pushedAt: 1 },
        commitUrl: 'u',
      };
    });

    await connect();
    await enqueue(submission('a', '1'));
    await enqueue(submission('b', '2'));
    await drainQueue();

    expect(maxInFlight).toBe(1);
    expect(pushSubmission).toHaveBeenCalledTimes(2);
  });

  it('backs off and keeps the item after a transient failure', async () => {
    pushSubmission.mockRejectedValue(new Error('network died'));
    await connect();
    await enqueue(submission());
    await drainQueue();

    const [item] = (await readGithubState()).queue;
    expect(item!.attempts).toBe(1);
    expect(item!.lastError).toContain('network died');
    expect(item!.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it('gives up after MAX_ATTEMPTS and logs a visible failure', async () => {
    pushSubmission.mockRejectedValue(new Error('still broken'));
    await connect();
    await enqueue(submission());

    // Pre-age the item to the last attempt rather than looping through every backoff.
    await updateGithubState((state) => {
      state.queue[0]!.attempts = MAX_ATTEMPTS - 1;
    });
    await drainQueue();

    const state = await readGithubState();
    expect(state.queue).toHaveLength(0);
    expect(state.log[0]).toMatchObject({ status: 'failed' });
    expect(state.log[0]!.detail).toContain('Gave up');
  });

  it('clears the token on an auth failure but keeps the work queued', async () => {
    // Reconnecting should resume the backlog, not start from nothing.
    pushSubmission.mockRejectedValue(new GithubAuthError('bad credentials'));
    await connect();
    await enqueue(submission());
    await drainQueue();

    const state = await readGithubState();
    expect(state.token).toBeUndefined();
    expect(state.enabled).toBe(false);
    expect(state.queue).toHaveLength(1);
    expect(state.log[0]).toMatchObject({ status: 'failed' });
  });

  it('stops the whole drain on a rate limit instead of burning every item', async () => {
    pushSubmission.mockRejectedValue(new GithubRateLimitError('slow down', 60_000));
    await connect();
    await enqueue(submission('a', '1'));
    await enqueue(submission('b', '2'));
    await drainQueue();

    expect(pushSubmission).toHaveBeenCalledTimes(1);
    expect((await readGithubState()).queue).toHaveLength(2);
  });

  it('skips items that are not due yet', async () => {
    await connect();
    await enqueue(submission());
    await updateGithubState((state) => {
      state.queue[0]!.nextAttemptAt = Date.now() + 60_000;
    });
    await drainQueue();

    expect(pushSubmission).not.toHaveBeenCalled();
  });
});

describe('classify', () => {
  it('treats an auth error as terminal and fatal', () => {
    expect(classify(new GithubAuthError('x'))).toMatchObject({ fatal: true, terminal: true });
  });

  it('honours the wait GitHub asked for on a rate limit', () => {
    expect(classify(new GithubRateLimitError('x', 30_000))).toMatchObject({
      waitMs: 30_000,
      fatal: true,
      terminal: false,
    });
  });

  it('retries a conflict promptly, since rebuilding on the new head is the fix', () => {
    const result = classify(new GithubConflictError('x'));
    expect(result.fatal).toBe(false);
    expect(result.waitMs).toBeLessThan(10_000);
  });

  it('leaves the wait to the backoff schedule for anything else', () => {
    expect(classify(new Error('boom')).waitMs).toBeUndefined();
  });
});

describe('backoffFor', () => {
  it('escalates then plateaus', () => {
    expect(backoffFor(0)).toBe(60_000);
    expect(backoffFor(1)).toBeGreaterThan(backoffFor(0));
    expect(backoffFor(99)).toBe(backoffFor(4));
  });
});

describe('nextDueAt', () => {
  it('is undefined for an empty queue, so no alarm is armed', async () => {
    expect(nextDueAt(await readGithubState())).toBeUndefined();
  });

  it('reports the earliest due time', async () => {
    await enqueue(submission('a', '1'));
    await enqueue(submission('b', '2'));
    await updateGithubState((state) => {
      state.queue[0]!.nextAttemptAt = 5_000;
      state.queue[1]!.nextAttemptAt = 1_000;
    });
    expect(nextDueAt(await readGithubState())).toBe(1_000);
  });
});

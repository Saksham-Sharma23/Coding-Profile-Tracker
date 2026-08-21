import { beforeEach, describe, expect, it } from 'vitest';
import { updateState } from '@/storage/repo';
import type { PlatformId } from '@/platforms/types';
import { mockChromeStorage } from '@/test/chrome-storage';
import { isStale } from './scheduler';

const HOUR = 60 * 60 * 1000;

/** Stores one snapshot with a given age, optionally hand-written. */
async function snapshot(id: PlatformId, ageMs: number, manual?: true) {
  await updateState((state) => {
    state.settings.refreshMinutes = 60;
    state.snapshots[id] = {
      status: 'ok',
      fetchedAt: Date.now() - ageMs,
      ...(manual && { manual: true }),
    };
  });
}

beforeEach(mockChromeStorage);

describe('isStale', () => {
  it('is stale with nothing stored', async () => {
    expect(await isStale()).toBe(true);
  });

  it('is fresh just after a fetch, and stale an interval later', async () => {
    await snapshot('leetcode', 5 * 60_000);
    expect(await isStale()).toBe(false);

    await snapshot('leetcode', 2 * HOUR);
    expect(await isStale()).toBe(true);
  });

  it('ignores a hand-kept counter when deciding freshness', async () => {
    /*
     * The blocker this test exists for. A manual +1 stamps `fetchedAt` with the moment
     * the user clicked, which is not evidence that anything was fetched. Counting it
     * would let one click convince the popup that five hours-old platforms were fresh,
     * suppressing auto-refresh for a whole interval.
     */
    await snapshot('leetcode', 5 * HOUR);
    await snapshot('custom:striver-7f3a', 0, true);

    expect(await isStale()).toBe(true);
  });

  it('is stale when the only snapshot is a manual one', async () => {
    // Nothing has ever been fetched, so there is nothing to call fresh.
    await snapshot('custom:striver-7f3a', 0, true);
    expect(await isStale()).toBe(true);
  });
});

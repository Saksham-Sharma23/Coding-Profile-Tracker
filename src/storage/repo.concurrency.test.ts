/**
 * Concurrency guarantees of the storage chokepoints.
 *
 * Every test here runs against a stub with real IPC latency. That is the point: with a
 * synchronous stub a read-modify-write cycle can never interleave, so the lost-update
 * bug these cover was structurally invisible to the rest of the suite while shipping in
 * every concurrent refresh.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mockChromeStorage } from '@/test/chrome-storage';
import type { PlatformStats } from '@/platforms/types';
import { readState, recordManual, recordSuccess, updateState } from './repo';
import type { CustomPlatform } from './schema';

const AT = 1_700_000_000_000;

function stats(platform: string, total: number): PlatformStats {
  return {
    platform,
    handle: 'user',
    fetchedAt: AT,
    headline: [{ label: 'Solved', value: total, delta: 'solved' }],
    solved: { total },
  };
}

describe('updateState under concurrency', () => {
  beforeEach(() => mockChromeStorage({ latencyMs: 1 }));

  it('keeps every platform when refreshes land together', async () => {
    // Exactly what refreshAll does: adapters resolve in parallel and each writes its own
    // result. Unserialized, the later writes clobber the earlier ones and all but one
    // platform disappears — snapshot, history point and solved list alike.
    await Promise.all(
      ['leetcode', 'codeforces', 'codechef', 'hackerrank'].map((id) =>
        recordSuccess(stats(id, 10)),
      ),
    );

    const state = await readState();
    expect(Object.keys(state.snapshots).sort()).toEqual([
      'codechef',
      'codeforces',
      'hackerrank',
      'leetcode',
    ]);
    expect(Object.keys(state.history).sort()).toEqual([
      'codechef',
      'codeforces',
      'hackerrank',
      'leetcode',
    ]);
  });

  it('applies every increment when a counter is clicked repeatedly', async () => {
    const def: CustomPlatform = {
      id: 'custom:sheet-1234',
      displayName: 'Striver SDE',
      accent: '#2a78d6',
      source: 'manual',
      countsTowardTotal: false,
      chartRating: false,
    };

    // The UI disables its buttons while a write is in flight, but the storage layer has
    // to be correct even when it does not — a second surface can click at the same time.
    await Promise.all(
      Array.from({ length: 5 }, () => recordManual(def, (current) => current + 1)),
    );

    const state = await readState();
    expect(state.snapshots[def.id]?.stats?.solved?.total).toBe(5);
  });

  it('does not lose a settings write racing a refresh', async () => {
    await Promise.all([
      recordSuccess(stats('leetcode', 42)),
      updateState((state) => {
        state.settings.dailyGoal = 3;
      }),
    ]);

    const state = await readState();
    expect(state.settings.dailyGoal).toBe(3);
    expect(state.snapshots.leetcode?.stats?.solved?.total).toBe(42);
  });

  it('keeps serving later mutations after one throws', async () => {
    const failed = updateState(() => {
      throw new Error('mutation blew up');
    });

    await expect(failed).rejects.toThrow('mutation blew up');

    // A wedged chain would hang here rather than resolving.
    await recordSuccess(stats('leetcode', 7));
    expect((await readState()).snapshots.leetcode?.stats?.solved?.total).toBe(7);
  });
});

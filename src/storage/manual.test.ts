import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MANUAL_COUNT } from '@/platforms/custom/adapter';
import { mockChromeStorage } from '@/test/chrome-storage';
import type { CustomPlatform } from './custom';
import { readState, recordManual, recordSuccess, updateState } from './repo';

const STRIVER: CustomPlatform = {
  id: 'custom:striver-sde-sheet-7f3a',
  displayName: 'Striver SDE Sheet',
  accent: '#7c5cff',
  source: 'manual',
  target: 191,
  countsTowardTotal: false,
  chartRating: false,
};

const total = async () => (await readState()).snapshots[STRIVER.id]?.stats?.solved?.total;

beforeEach(() => {
  mockChromeStorage();
  vi.useRealTimers();
});

describe('recordManual', () => {
  it('sets an exact count', async () => {
    await recordManual(STRIVER, 191);
    expect(await total()).toBe(191);
  });

  it('adds and subtracts against the stored value', async () => {
    await recordManual(STRIVER, 45);
    await recordManual(STRIVER, (n) => n + 1);
    await recordManual(STRIVER, (n) => n + 1);
    expect(await total()).toBe(47);

    await recordManual(STRIVER, (n) => n - 1);
    expect(await total()).toBe(46);
  });

  it('resolves the callback against storage, not a stale capture', async () => {
    /*
     * The read-modify-write hazard. Two surfaces can be open at once and writes are
     * whole-blob last-wins, so an increment computed from what a component last
     * rendered would silently lose its sibling's. Both of these start from a captured
     * value of 10; only a resolver run inside the update reaches 12.
     */
    await recordManual(STRIVER, 10);
    await Promise.all([
      recordManual(STRIVER, (n) => n + 1),
      recordManual(STRIVER, (n) => n + 1),
    ]);
    expect(await total()).toBe(12);
  });

  it('floors at zero rather than going negative', async () => {
    await recordManual(STRIVER, 0);
    await recordManual(STRIVER, (n) => n - 5);
    expect(await total()).toBe(0);
  });

  it('caps an absurd paste instead of storing it', async () => {
    await recordManual(STRIVER, 5_000_000);
    expect(await total()).toBe(MAX_MANUAL_COUNT);
  });

  it('marks the snapshot manual, so isStale can discount it', async () => {
    await recordManual(STRIVER, 1);
    expect((await readState()).snapshots[STRIVER.id]?.manual).toBe(true);
  });

  it('writes one history point per day, not one per click', async () => {
    // Five +1s in an afternoon are one day's work. appendHistory overwrites the same
    // UTC day, and recordManual routes through it for exactly this reason.
    await recordManual(STRIVER, 191);
    for (let i = 0; i < 5; i++) await recordManual(STRIVER, (n) => n + 1);

    const series = (await readState()).history[STRIVER.id] ?? [];
    expect(series).toHaveLength(1);
    expect(series[0]?.solved).toBe(196);
  });

  it('starts from zero when nothing is stored yet', async () => {
    await recordManual(STRIVER, (n) => n + 1);
    expect(await total()).toBe(1);
  });

  it('leaves other platforms untouched', async () => {
    await updateState((state) => {
      state.history.leetcode = [{ d: '2026-08-01', solved: 300 }];
    });
    await recordManual(STRIVER, 45);

    const state = await readState();
    expect(state.history.leetcode).toHaveLength(1);
    expect(state.snapshots.leetcode).toBeUndefined();
  });

  it('does not trip the account-identity guard on repeated writes', async () => {
    // A counter's handle is the empty string every time. If the guard read that as a
    // changed account it would wipe the history on every single click.
    await recordManual(STRIVER, 10);
    await updateState((state) => {
      state.history[STRIVER.id] = [
        { d: '2026-08-01', solved: 5 },
        ...(state.history[STRIVER.id] ?? []),
      ];
    });
    await recordManual(STRIVER, (n) => n + 1);

    expect((await readState()).history[STRIVER.id]?.length).toBeGreaterThan(1);
  });
});

describe('recordSuccess still behaves', () => {
  it('writes a fetched snapshot without the manual flag', async () => {
    // The extracted applyStats is shared, so this guards against manual: true leaking
    // onto real fetches and suppressing the popup's auto-refresh.
    await recordSuccess({
      platform: 'leetcode',
      handle: 'neal_wu',
      fetchedAt: Date.parse('2026-08-12T10:00:00Z'),
      headline: [{ label: 'Solved', value: 300, delta: 'solved' }],
      solved: { total: 300 },
    });

    const snapshot = (await readState()).snapshots.leetcode;
    expect(snapshot?.status).toBe('ok');
    expect(snapshot?.manual).toBeUndefined();
  });
});

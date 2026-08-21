import { describe, expect, it } from 'vitest';
import { FETCHED_PLATFORM, type PlatformAdapter, type PlatformId, type PlatformStats } from '@/platforms/types';
import { defaultState, type HistoryPoint, type TrackerState } from '@/storage/schema';
import { bestStreak, isExpanded, solvedToday, totalSolved, trendFor, visiblePlatforms } from './progress';

const TODAY = '2026-08-04';

function adapter(id: PlatformId, displayName: string = id): PlatformAdapter {
  return {
    id,
    displayName,
    accent: '#000',
    capabilities: FETCHED_PLATFORM,
    profileUrl: (handle) => `https://example.com/${handle}`,
    fetchStats: () => Promise.reject(new Error('not used')),
  };
}

function stateWith(
  parts: {
    solved?: Partial<Record<PlatformId, number>>;
    streak?: Partial<Record<PlatformId, number>>;
    history?: Partial<Record<PlatformId, HistoryPoint[]>>;
    handles?: Partial<Record<PlatformId, string>>;
    enabled?: Partial<Record<PlatformId, boolean>>;
  } = {},
): TrackerState {
  const state = defaultState();
  state.settings.handles = parts.handles ?? {};
  state.settings.enabled = parts.enabled ?? {};
  state.history = parts.history ?? {};

  const ids = new Set<PlatformId>([
    ...(Object.keys(parts.solved ?? {}) as PlatformId[]),
    ...(Object.keys(parts.streak ?? {}) as PlatformId[]),
  ]);
  for (const id of ids) {
    const solved = parts.solved?.[id];
    const streak = parts.streak?.[id];
    const stats = {
      platform: id,
      handle: 'x',
      fetchedAt: 0,
      headline: [],
      ...(solved !== undefined && { solved: { total: solved } }),
      ...(streak !== undefined && { activity: { streak } }),
    } as PlatformStats;
    state.snapshots[id] = { status: 'ok', stats, fetchedAt: 0 };
  }
  return state;
}

describe('solvedToday', () => {
  const leetcode = adapter('leetcode', 'LeetCode');
  const codeforces = adapter('codeforces', 'Codeforces');

  it('measures against yesterday specifically', () => {
    const state = stateWith({
      solved: { leetcode: 44 },
      history: {
        leetcode: [
          { d: '2026-08-03', solved: 40 },
          { d: TODAY, solved: 44 },
        ],
      },
    });
    expect(solvedToday(state, [leetcode], TODAY)).toEqual({ solved: 4, partial: false });
  });

  it('reports nothing rather than inflating when yesterday is missing', () => {
    // The browser was closed for three days. previousPoint() would answer 40 here and
    // claim four days of work as today's.
    const state = stateWith({
      solved: { leetcode: 44 },
      history: { leetcode: [{ d: '2026-08-01', solved: 40 }] },
    });
    expect(solvedToday(state, [leetcode], TODAY)).toEqual({ partial: true });
  });

  it('flags a partial total when only some platforms have a baseline', () => {
    const state = stateWith({
      solved: { leetcode: 44, codeforces: 300 },
      history: {
        leetcode: [{ d: '2026-08-03', solved: 40 }],
        codeforces: [{ d: '2026-07-20', solved: 290 }],
      },
    });
    expect(solvedToday(state, [leetcode, codeforces], TODAY)).toEqual({ solved: 4, partial: true });
  });

  it('treats a count that went down as a recount, not negative progress', () => {
    const state = stateWith({
      solved: { leetcode: 38 },
      history: { leetcode: [{ d: '2026-08-03', solved: 40 }] },
    });
    expect(solvedToday(state, [leetcode], TODAY).solved).toBe(0);
  });

  it('ignores platforms that publish no solve count at all', () => {
    // HackerRank deliberately reports none, so it must not make the total partial.
    const state = stateWith({
      solved: { leetcode: 44 },
      streak: { hackerrank: 3 },
      history: { leetcode: [{ d: '2026-08-03', solved: 44 }] },
    });
    const result = solvedToday(state, [leetcode, adapter('hackerrank')], TODAY);
    expect(result).toEqual({ solved: 0, partial: false });
  });
});

describe('bestStreak', () => {
  it('attributes the streak to the platform that reported it', () => {
    const state = stateWith({ streak: { leetcode: 12, geeksforgeeks: 4 } });
    expect(bestStreak(state, [adapter('leetcode', 'LeetCode'), adapter('geeksforgeeks', 'GFG')])).toEqual({
      days: 12,
      source: 'LeetCode',
    });
  });

  it('returns nothing when no platform publishes a streak', () => {
    expect(bestStreak(stateWith({ solved: { codeforces: 10 } }), [adapter('codeforces')])).toBeUndefined();
  });
});

describe('totalSolved', () => {
  it('sums only the platforms that report a count', () => {
    const state = stateWith({ solved: { leetcode: 40, codeforces: 312 }, streak: { hackerrank: 2 } });
    expect(totalSolved(state, [adapter('leetcode'), adapter('codeforces'), adapter('hackerrank')])).toBe(352);
  });
});

describe('trendFor', () => {
  it('prefers rating over solve count when both are recorded', () => {
    const trend = trendFor([
      { d: '2026-08-01', solved: 10, rating: 1400 },
      { d: '2026-08-02', solved: 12, rating: 1420 },
    ]);
    expect(trend?.label).toBe('Rating');
    expect(trend?.points.map((p) => p.v)).toEqual([1400, 1420]);
  });

  it('falls back to solve count when there is only one rating point', () => {
    const trend = trendFor([
      { d: '2026-08-01', solved: 10 },
      { d: '2026-08-02', solved: 12, rating: 1420 },
    ]);
    expect(trend?.label).toBe('Solved');
  });

  it('windows to the most recent days', () => {
    const history = Array.from({ length: 60 }, (_, i) => ({
      d: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      solved: i,
    }));
    expect(trendFor(history, 30)?.points).toHaveLength(30);
  });

  it('returns nothing for empty history', () => {
    expect(trendFor(undefined)).toBeUndefined();
    expect(trendFor([])).toBeUndefined();
  });
});

describe('visiblePlatforms', () => {
  const all = [adapter('leetcode'), adapter('codeforces'), adapter('codechef')];

  it('keeps platforms with a handle that are not switched off', () => {
    const state = stateWith({
      handles: { leetcode: 'a', codeforces: 'b', codechef: '  ' },
      enabled: { codeforces: false },
    });
    expect(visiblePlatforms(state, all).map((a) => a.id)).toEqual(['leetcode']);
  });
});

describe('isExpanded', () => {
  it('treats the stored list as the only authority', () => {
    // No "auto-open the only platform" rule: it made that row impossible to collapse,
    // because collapsing emptied the list and the rule immediately re-opened it.
    expect(isExpanded([], 'leetcode')).toBe(false);
    expect(isExpanded(['leetcode'], 'leetcode')).toBe(true);
    expect(isExpanded(['codeforces'], 'leetcode')).toBe(false);
  });
});

/* ---- capability-driven behaviour (hand-kept counters) -------------------- */

/** A user-defined manual counter: no handle, never fetched, gap means "unchanged". */
function manual(id: PlatformId, countsTowardTotal = false): PlatformAdapter {
  return {
    id,
    displayName: id,
    accent: '#7c5cff',
    capabilities: {
      ...FETCHED_PLATFORM,
      countsTowardTotal,
      requiresHandle: false,
      fetchable: false,
      baselineFromLastKnown: true,
    },
    fetchStats: () => Promise.reject(new Error('not used')),
  };
}

describe('visiblePlatforms — platforms that need no handle', () => {
  it('shows a hand-kept counter, which by definition has no username', () => {
    // The blocker: an unconditional handle check hid every custom counter from the
    // popup, the dashboard and the badge at once.
    const state = stateWith({ handles: { leetcode: 'a' } });
    const ids = visiblePlatforms(state, [adapter('leetcode'), manual('custom:striver-7f3a')]).map(
      (a) => a.id,
    );
    expect(ids).toEqual(['leetcode', 'custom:striver-7f3a']);
  });

  it('still honours the on/off switch for one', () => {
    const state = stateWith({ enabled: { 'custom:striver-7f3a': false } });
    expect(visiblePlatforms(state, [manual('custom:striver-7f3a')])).toEqual([]);
  });
});

describe('totalSolved — countsTowardTotal', () => {
  it('leaves out a platform that declares it does not count', () => {
    // Striver's sheet is a curated list of LeetCode problems; counting both counts the
    // same work twice, and only the user knows which of their sheets are like that.
    const state = stateWith({ solved: { leetcode: 300, 'custom:striver-7f3a': 191 } });
    const all = [adapter('leetcode'), manual('custom:striver-7f3a')];

    expect(totalSolved(state, all)).toBe(300);
  });

  it('includes one that declares it does', () => {
    const state = stateWith({ solved: { leetcode: 300, 'custom:atcoder-7f3a': 57 } });
    expect(totalSolved(state, [adapter('leetcode'), manual('custom:atcoder-7f3a', true)])).toBe(357);
  });
});

describe('solvedToday — hand-kept counters', () => {
  const striver = manual('custom:striver-7f3a', true);

  it('falls back to the last known day when yesterday is missing', () => {
    // A counter set to 191 last week and untouched since has not moved. For a fetched
    // platform the same gap means "we did not look" and stays unknown.
    const state = stateWith({
      solved: { 'custom:striver-7f3a': 196 },
      history: { 'custom:striver-7f3a': [{ d: '2026-07-28', solved: 191 }] },
    });
    expect(solvedToday(state, [striver], TODAY)).toEqual({ solved: 5, partial: false });
  });

  it('never falls back to zero, which would report the whole standing count', () => {
    // The tempting shortcut. It would claim 191 problems solved today.
    const state = stateWith({
      solved: { 'custom:striver-7f3a': 191 },
      history: { 'custom:striver-7f3a': [{ d: '2026-07-28', solved: 191 }] },
    });
    expect(solvedToday(state, [striver], TODAY).solved).toBe(0);
  });

  it('is still partial on the very first day, with nothing to measure against', () => {
    const state = stateWith({
      solved: { 'custom:striver-7f3a': 191 },
      history: { 'custom:striver-7f3a': [{ d: TODAY, solved: 191 }] },
    });
    expect(solvedToday(state, [striver], TODAY)).toEqual({ partial: true });
  });

  it('prefers a real yesterday point over the fallback', () => {
    const state = stateWith({
      solved: { 'custom:striver-7f3a': 50 },
      history: {
        'custom:striver-7f3a': [
          { d: '2026-07-01', solved: 10 },
          { d: '2026-08-03', solved: 45 },
        ],
      },
    });
    expect(solvedToday(state, [striver], TODAY).solved).toBe(5);
  });

  it('cannot be made partial by a platform that does not count', () => {
    /*
     * Filtered before the loop, not inside it. Otherwise an excluded platform with no
     * baseline still sets partial: true, and the UI apologises for omitting a number
     * the user explicitly asked it to omit.
     */
    const state = stateWith({
      solved: { leetcode: 44, 'custom:striver-7f3a': 191 },
      history: { leetcode: [{ d: '2026-08-03', solved: 40 }] },
    });
    const result = solvedToday(state, [adapter('leetcode'), manual('custom:striver-7f3a')], TODAY);
    expect(result).toEqual({ solved: 4, partial: false });
  });
});

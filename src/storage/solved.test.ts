import { describe, expect, it } from 'vitest';
import type { SolvedProblem } from '@/platforms/types';
import { mergeSolved } from './repo';
import { defaultState } from './schema';

const problem = (key: string, solvedAt: number, name = key): SolvedProblem => ({
  key,
  name,
  url: `https://example.com/${key}`,
  solvedAt,
});

describe('mergeSolved', () => {
  it('accumulates across refreshes rather than replacing', () => {
    // The whole point: LeetCode only ever returns its 20 most recent, so replacing
    // would shrink the list to 20 on every refresh and discard everything older.
    const state = defaultState();

    mergeSolved(state, 'leetcode', [problem('a', 300), problem('b', 200)]);
    mergeSolved(state, 'leetcode', [problem('c', 400)]);

    expect(state.solved.leetcode?.map((p) => p.key)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the earliest solve date when a problem is seen again', () => {
    const state = defaultState();

    mergeSolved(state, 'codeforces', [problem('1-A', 1_000)]);
    mergeSolved(state, 'codeforces', [problem('1-A', 5_000)]);

    expect(state.solved.codeforces).toHaveLength(1);
    expect(state.solved.codeforces?.[0]?.solvedAt).toBe(1_000);
  });

  it('refreshes the other fields while holding the date', () => {
    const state = defaultState();
    mergeSolved(state, 'codeforces', [problem('1-A', 1_000, 'Old Name')]);
    mergeSolved(state, 'codeforces', [
      { ...problem('1-A', 9_000, 'Corrected Name'), difficulty: 1600 },
    ]);

    expect(state.solved.codeforces?.[0]).toMatchObject({
      name: 'Corrected Name',
      difficulty: 1600,
      solvedAt: 1_000,
    });
  });

  it('sorts newest first and keeps platforms independent', () => {
    const state = defaultState();
    mergeSolved(state, 'leetcode', [problem('lc', 100)]);
    mergeSolved(state, 'codeforces', [problem('cf', 900)]);

    expect(state.solved.leetcode?.map((p) => p.key)).toEqual(['lc']);
    expect(state.solved.codeforces?.map((p) => p.key)).toEqual(['cf']);
  });

  it('caps the list, discarding the oldest', () => {
    const state = defaultState();
    mergeSolved(
      state,
      'codeforces',
      Array.from({ length: 5200 }, (_, i) => problem(`p${i}`, i)),
    );

    const stored = state.solved.codeforces!;
    expect(stored).toHaveLength(5000);
    expect(stored[0]?.key).toBe('p5199');
    // The 200 oldest fell off, not the newest.
    expect(stored.some((p) => p.key === 'p0')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  FETCHED_PLATFORM,
  type PlatformAdapter,
  type PlatformCapabilities,
  type PlatformId,
} from '@/platforms/types';
import { defaultState } from '@/storage/schema';
import { allSolved, coverageNote, filterSolved, solvedOnDay } from './solved';

function adapter(
  id: PlatformId,
  displayName: string,
  caps: Partial<PlatformCapabilities> = {},
): PlatformAdapter {
  return {
    id,
    displayName,
    accent: '#000',
    capabilities: { ...FETCHED_PLATFORM, ...caps },
    profileUrl: () => '',
    fetchStats: () => Promise.reject(new Error('not used')),
  };
}

// The two platforms that publish a problem list.
const CF = adapter('codeforces', 'Codeforces', { problemList: true });
const LC = adapter('leetcode', 'LeetCode', { problemList: true });

const DAY = 86_400_000;
const T = Date.parse('2026-08-06T10:00:00Z');

function state() {
  const next = defaultState();
  next.solved = {
    codeforces: [
      { key: '1-A', name: 'Theatre Square', url: 'cf1', solvedAt: T, difficulty: 1000, tags: ['math'] },
      { key: '4-B', name: 'Before an Exam', url: 'cf2', solvedAt: T - 3 * DAY, difficulty: 1200 },
    ],
    leetcode: [{ key: 'two-sum', name: 'Two Sum', url: 'lc1', solvedAt: T - DAY }],
  };
  return next;
}

describe('allSolved', () => {
  it('merges platforms into one list, newest first, tagged with their platform', () => {
    const entries = allSolved(state(), [CF, LC]);

    expect(entries.map((e) => e.name)).toEqual(['Theatre Square', 'Two Sum', 'Before an Exam']);
    expect(entries[1]!.platformName).toBe('LeetCode');
  });

  it('only includes platforms the user tracks', () => {
    expect(allSolved(state(), [LC]).map((e) => e.name)).toEqual(['Two Sum']);
    expect(allSolved(defaultState(), [CF, LC])).toEqual([]);
  });
});

describe('solvedOnDay', () => {
  it('picks out one UTC day', () => {
    const entries = allSolved(state(), [CF, LC]);
    expect(solvedOnDay(entries, '2026-08-06').map((e) => e.name)).toEqual(['Theatre Square']);
    expect(solvedOnDay(entries, '2026-08-04')).toEqual([]);
  });
});

describe('filterSolved', () => {
  const entries = allSolved(state(), [CF, LC]);

  it('matches on name, platform, difficulty and tags', () => {
    expect(filterSolved(entries, 'theatre').map((e) => e.key)).toEqual(['1-A']);
    expect(filterSolved(entries, 'leetcode').map((e) => e.key)).toEqual(['two-sum']);
    expect(filterSolved(entries, 'math').map((e) => e.key)).toEqual(['1-A']);
    expect(filterSolved(entries, '1200').map((e) => e.key)).toEqual(['4-B']);
  });

  it('narrows with each term rather than widening', () => {
    expect(filterSolved(entries, 'codeforces math')).toHaveLength(1);
    expect(filterSolved(entries, 'codeforces two-sum')).toHaveLength(0);
  });

  it('returns everything for an empty query', () => {
    expect(filterSolved(entries, '')).toHaveLength(3);
    expect(filterSolved(entries, '   ')).toHaveLength(3);
  });
});

describe('coverageNote', () => {
  it('names the tracked platforms that publish no problem list', () => {
    // Silence here would leave the user wondering where their CodeChef solves went.
    expect(coverageNote([CF, adapter('codechef', 'CodeChef')])).toBe(
      'CodeChef does not publish which problems were solved, only totals.',
    );
    expect(coverageNote([adapter('codechef', 'CodeChef'), adapter('hackerrank', 'HackerRank')])).toBe(
      'CodeChef and HackerRank do not publish which problems were solved, only totals.',
    );
  });

  it('says nothing when every tracked platform is covered', () => {
    expect(coverageNote([CF, LC])).toBeUndefined();
  });
});

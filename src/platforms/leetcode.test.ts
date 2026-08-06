import { describe, expect, it } from 'vitest';
import { buildStats, parseCalendar } from './leetcode';
import { HandleNotFoundError } from './types';
import fixture from './__fixtures__/leetcode-profile.json';

const AT = 1_700_000_000_000;

describe('leetcode', () => {
  it('parses a real profile response', () => {
    const stats = buildStats(fixture, 'neal_wu', AT);

    expect(stats.platform).toBe('leetcode');
    expect(stats.handle).toBe('neal_wu');
    expect(stats.solved).toMatchObject({ total: 253, easy: 60, medium: 141, hard: 52 });
    // Contest rating comes back as a float and must be rounded for display.
    expect(stats.rating?.current).toBe(3686);
    expect(stats.rating?.globalRank).toBe(2);
    expect(stats.headline.length).toBeGreaterThan(0);
  });

  it('rounds the float contest rating rather than truncating', () => {
    const stats = buildStats(
      { data: { matchedUser: base(), userContestRanking: { rating: 1899.6 } } },
      'x',
      AT,
    );
    expect(stats.rating?.current).toBe(1900);
  });

  it('omits rating for users who never entered a contest', () => {
    const stats = buildStats(
      { data: { matchedUser: base(), userContestRanking: null } },
      'x',
      AT,
    );
    expect(stats.rating).toBeUndefined();
    expect(stats.headline.some((h) => h.label === 'Contest')).toBe(false);
  });

  it('throws HandleNotFoundError when matchedUser is null', () => {
    // Unknown users are HTTP 200 with an errors array, not a 404.
    const body = {
      data: { matchedUser: null, userContestRanking: null },
      errors: [{ message: 'That user does not exist.' }],
    };
    expect(() => buildStats(body, 'ghost', AT)).toThrow(HandleNotFoundError);
  });

  describe('parseCalendar', () => {
    it('converts epoch-second keys to ISO dates', () => {
      expect(parseCalendar('{"1700006400":3,"1700092800":5}')).toEqual({
        '2023-11-15': 3,
        '2023-11-16': 5,
      });
    });

    it('returns undefined for empty or malformed calendars', () => {
      expect(parseCalendar('{}')).toBeUndefined();
      expect(parseCalendar('not json')).toBeUndefined();
      expect(parseCalendar(undefined)).toBeUndefined();
    });
  });
});

function base() {
  return {
    username: 'x',
    submitStatsGlobal: {
      acSubmissionNum: [
        { difficulty: 'All', count: 10 },
        { difficulty: 'Easy', count: 10 },
      ],
    },
  };
}

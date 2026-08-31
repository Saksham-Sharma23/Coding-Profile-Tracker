import { describe, expect, it } from 'vitest';
import { buildStats, currentStreak, parseCalendar, parseRecentSolved } from './leetcode';
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

  describe('parseRecentSolved', () => {
    // The exact shape returned live: id and timestamp are strings, not numbers.
    const entry = (slug: string, title: string, seconds: number) => ({
      id: String(seconds),
      title,
      titleSlug: slug,
      timestamp: String(seconds),
    });

    it('maps recent accepted submissions to linkable problems, newest first', () => {
      const solved = parseRecentSolved({
        data: {
          matchedUser: null,
          userContestRanking: null,
          recentAcSubmissionList: [
            entry('two-sum', 'Two Sum', 1_786_300_000),
            entry('add-two-numbers', 'Add Two Numbers', 1_786_200_000),
          ],
        },
      });

      expect(solved.map((p) => p.key)).toEqual(['two-sum', 'add-two-numbers']);
      expect(solved[0]).toMatchObject({
        name: 'Two Sum',
        url: 'https://leetcode.com/problems/two-sum/',
        solvedAt: 1_786_300_000_000,
      });
    });

    it('keeps the earliest solve when a problem appears twice in the window', () => {
      const solved = parseRecentSolved({
        data: {
          matchedUser: null,
          userContestRanking: null,
          recentAcSubmissionList: [
            entry('two-sum', 'Two Sum', 1_786_300_000),
            entry('two-sum', 'Two Sum', 1_786_100_000),
          ],
        },
      });
      expect(solved).toHaveLength(1);
      expect(solved[0]!.solvedAt).toBe(1_786_100_000_000);
    });

    it('skips entries with no slug, since there would be no way to link back', () => {
      const solved = parseRecentSolved({
        data: {
          matchedUser: null,
          userContestRanking: null,
          recentAcSubmissionList: [
            { title: 'Orphan', timestamp: '1786300000' },
            null,
            { ...entry('ok', 'Fine', 1_786_300_000), timestamp: 'not-a-number' },
          ],
        },
      });
      expect(solved).toEqual([]);
    });

    it('returns nothing when the field is absent or null', () => {
      expect(parseRecentSolved({})).toEqual([]);
      expect(
        parseRecentSolved({
          data: { matchedUser: null, userContestRanking: null, recentAcSubmissionList: null },
        }),
      ).toEqual([]);
    });

    it('handles the captured profile, whose account has no recent activity', () => {
      // A real and expected case: an inactive account returns an empty list, which
      // must not be mistaken for "this platform has no problem feed".
      expect(parseRecentSolved(fixture)).toEqual([]);
      expect(buildStats(fixture, 'neal_wu', AT).solvedProblems).toBeUndefined();
    });
  });

  describe('currentStreak', () => {
    // 2023-11-15 UTC, matching the epoch keys used throughout these tests.
    const NOW = Date.parse('2023-11-15T12:00:00Z');
    const cal = (...days: string[]) => Object.fromEntries(days.map((d) => [d, 1]));

    it('counts consecutive days back from today', () => {
      expect(currentStreak(cal('2023-11-15', '2023-11-14', '2023-11-13'), NOW)).toBe(3);
    });

    it('does not break the streak on a day still in progress', () => {
      // Nothing solved yet today, but yesterday and before are unbroken. The streak is
      // not over until a whole day has passed with nothing in it.
      expect(currentStreak(cal('2023-11-14', '2023-11-13'), NOW)).toBe(2);
    });

    it('reports 0 once a full day has passed with nothing solved', () => {
      // This is the case userCalendar.streak got wrong: it kept reporting the year's
      // best run, so a lapsed streak showed as "7 days" forever.
      expect(currentStreak(cal('2023-11-01', '2023-10-31'), NOW)).toBe(0);
    });

    it('treats a zero count as no activity that day', () => {
      // Today recorded as 0 is the same as today being absent: the day is still in
      // progress, so the streak continues from yesterday rather than ending.
      expect(currentStreak({ '2023-11-15': 0, '2023-11-14': 2 }, NOW)).toBe(1);
      // A past day recorded as 0 does end it.
      expect(currentStreak({ '2023-11-14': 0, '2023-11-13': 2 }, NOW)).toBe(0);
    });

    it('stops at the first gap rather than counting every active day', () => {
      expect(currentStreak(cal('2023-11-15', '2023-11-14', '2023-11-12'), NOW)).toBe(2);
    });

    it('has no opinion when there is no calendar at all', () => {
      expect(currentStreak(undefined, NOW)).toBeUndefined();
    });
  });

  describe('streak reported by buildStats', () => {
    it('derives the streak from the calendar, not from userCalendar.streak', () => {
      const at = Date.parse('2023-11-15T12:00:00Z');
      const body = {
        data: {
          matchedUser: {
            username: 'u',
            submitStatsGlobal: { acSubmissionNum: [{ difficulty: 'All', count: 10 }] },
            userCalendar: {
              // What LeetCode reports for the year: a best run of 7 that has long lapsed.
              streak: 7,
              totalActiveDays: 40,
              submissionCalendar: JSON.stringify({
                [Date.parse('2023-11-14T00:00:00Z') / 1000]: 2,
                [Date.parse('2023-11-13T00:00:00Z') / 1000]: 1,
              }),
            },
          },
          userContestRanking: null,
          recentAcSubmissionList: null,
        },
      };

      expect(buildStats(body, 'u', at).activity?.streak).toBe(2);
    });

    it('reports a lapsed streak as 0 rather than the year best', () => {
      const at = Date.parse('2023-11-15T12:00:00Z');
      const body = {
        data: {
          matchedUser: {
            username: 'u',
            submitStatsGlobal: { acSubmissionNum: [{ difficulty: 'All', count: 10 }] },
            userCalendar: {
              streak: 7,
              totalActiveDays: 40,
              submissionCalendar: JSON.stringify({
                [Date.parse('2023-09-01T00:00:00Z') / 1000]: 3,
              }),
            },
          },
          userContestRanking: null,
          recentAcSubmissionList: null,
        },
      };

      expect(buildStats(body, 'u', at).activity?.streak).toBe(0);
    });
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

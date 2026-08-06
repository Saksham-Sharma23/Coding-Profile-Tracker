import { describe, expect, it } from 'vitest';
import type { PlatformAdapter, PlatformId } from '@/platforms/types';
import { defaultState } from '@/storage/schema';
import { formatCountdown, nextContest } from './countdown';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatCountdown', () => {
  it('shows at most two units', () => {
    expect(formatCountdown(2 * DAY + 4 * HOUR + 30 * MIN)).toBe('2d 4h');
    expect(formatCountdown(4 * HOUR + 20 * MIN)).toBe('4h 20m');
    expect(formatCountdown(18 * MIN)).toBe('18m');
  });

  it('never counts down past zero', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-5000)).toBe('now');
  });

  it('rounds the final seconds up to a minute rather than showing 0m', () => {
    expect(formatCountdown(20_000)).toBe('1m');
  });
});

describe('nextContest', () => {
  const adapter = (id: PlatformId): PlatformAdapter => ({
    id,
    displayName: id,
    accent: '#000',
    profileUrl: () => '',
    fetchStats: () => Promise.reject(new Error('not used')),
  });

  const now = Date.parse('2026-08-06T12:00:00Z');
  const state = () => {
    const next = defaultState();
    next.contests = {
      fetchedAt: now,
      items: [
        { platform: 'leetcode', name: 'Weekly 514', url: 'lc', startsAt: now + 3 * DAY },
        { platform: 'codeforces', name: 'Round 1115', url: 'cf', startsAt: now + 1 * DAY },
        { platform: 'codeforces', name: 'Round 1100', url: 'old', startsAt: now - DAY },
      ],
    };
    return next;
  };

  it('returns the soonest upcoming contest', () => {
    expect(nextContest(state(), [adapter('codeforces'), adapter('leetcode')], now)?.name).toBe(
      'Round 1115',
    );
  });

  it('ignores platforms the user does not track', () => {
    // A Codeforces round is noise for someone who only uses LeetCode.
    expect(nextContest(state(), [adapter('leetcode')], now)?.name).toBe('Weekly 514');
  });

  it('ignores contests that have already started', () => {
    expect(nextContest(state(), [adapter('codeforces')], now + 2 * DAY)).toBeUndefined();
  });

  it('returns nothing when no contests have been fetched', () => {
    expect(nextContest(defaultState(), [adapter('codeforces')], now)).toBeUndefined();
  });
});

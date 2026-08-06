import { describe, expect, it } from 'vitest';
import cfFixture from './__fixtures__/codeforces-contests.json';
import lcFixture from './__fixtures__/leetcode-contests.json';
import { parseCodeforcesContests, parseLeetcodeContests, type CfEnvelope, type LcEnvelope } from './contests';

// Well before every start time in the fixtures, so "upcoming" means what it says.
const BEFORE_ALL = Date.parse('2026-01-01T00:00:00Z');

describe('parseCodeforcesContests', () => {
  it('keeps only contests that have not started, soonest first', () => {
    const items = parseCodeforcesContests(cfFixture as CfEnvelope, BEFORE_ALL);

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.platform === 'codeforces')).toBe(true);
    expect(items.map((item) => item.startsAt)).toEqual(
      [...items.map((item) => item.startsAt)].sort((a, b) => a - b),
    );

    // The fixture holds finished contests too; none may survive the phase filter.
    const finished = (cfFixture as CfEnvelope).result!.filter((c) => c.phase !== 'BEFORE');
    expect(finished.length).toBeGreaterThan(0);
    expect(items).toHaveLength((cfFixture as CfEnvelope).result!.length - finished.length);
  });

  it('converts seconds to milliseconds and minutes', () => {
    const first = parseCodeforcesContests(cfFixture as CfEnvelope, BEFORE_ALL)[0]!;
    // The feed is not sorted by start time, so compare against the genuinely soonest.
    const source = (cfFixture as CfEnvelope)
      .result!.filter((c) => c.phase === 'BEFORE')
      .sort((a, b) => a.startTimeSeconds! - b.startTimeSeconds!)[0]!;
    expect(first.startsAt).toBe(source.startTimeSeconds! * 1000);
    expect(first.durationMinutes).toBe(Math.round(source.durationSeconds! / 60));
    expect(first.url).toContain('codeforces.com/contests/');
  });

  it('drops contests that have already started', () => {
    const afterAll = Date.parse('2030-01-01T00:00:00Z');
    expect(parseCodeforcesContests(cfFixture as CfEnvelope, afterAll)).toEqual([]);
  });

  it('returns nothing rather than throwing on a failed envelope', () => {
    expect(parseCodeforcesContests({ status: 'FAILED' }, BEFORE_ALL)).toEqual([]);
    expect(parseCodeforcesContests({ status: 'OK' }, BEFORE_ALL)).toEqual([]);
  });
});

describe('parseLeetcodeContests', () => {
  it('reads the upcoming weekly and biweekly', () => {
    const items = parseLeetcodeContests(lcFixture as LcEnvelope, BEFORE_ALL);

    expect(items).toHaveLength(2);
    expect(items[0]!.platform).toBe('leetcode');
    expect(items[0]!.url).toMatch(/^https:\/\/leetcode\.com\/contest\/.+\/$/);
    expect(items[0]!.durationMinutes).toBe(90);
    expect(items[0]!.startsAt).toBeLessThan(items[1]!.startsAt);
  });

  it('survives a null or absent contest list', () => {
    expect(parseLeetcodeContests({}, BEFORE_ALL)).toEqual([]);
    expect(parseLeetcodeContests({ data: { topTwoContests: null } }, BEFORE_ALL)).toEqual([]);
    expect(
      parseLeetcodeContests({ data: { topTwoContests: [null] } } as LcEnvelope, BEFORE_ALL),
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildStats } from './hackerrank';
import { ScrapeError } from './types';
import badges from './__fixtures__/hackerrank-badges.json';
import profile from './__fixtures__/hackerrank-profile.json';

const AT = 1_700_000_000_000;

describe('hackerrank', () => {
  it('parses real profile and badge responses', () => {
    const stats = buildStats(profile, badges, 'vaibhavdixit', AT);

    expect(stats.handle).toBe('vaibhavdixit');
    // 5 stars on Problem Solving + 1 on C++; the zero-star domains do not count.
    expect(stats.headline.find((h) => h.label === 'Stars')?.value).toBe(6);
    expect(stats.headline.find((h) => h.label === 'Badges')?.value).toBe(2);
    expect(stats.headline.find((h) => h.label === 'Level')?.value).toBe(4);
  });

  it('excludes never-started domains from the badge list', () => {
    expect(stats().badges?.every((badge) => badge.tier !== '0★')).toBe(true);
    expect(stats().badges?.[0]?.name).toBe('Problem Solving');
  });

  it('reports no solved count, since HackerRank has no unambiguous total', () => {
    // The MultiDomain badge overlaps the per-language ones; a summed total would be
    // wrong and would corrupt the dashboard's cross-platform figure.
    expect(stats().solved).toBeUndefined();
  });

  it('still builds a card when the badges call failed', () => {
    const partial = buildStats(profile, undefined, 'vaibhavdixit', AT);
    expect(partial.headline.find((h) => h.label === 'Stars')?.value).toBe(0);
    expect(partial.badges).toBeUndefined();
  });

  it('throws ScrapeError when the profile shape changes', () => {
    expect(() => buildStats({}, badges, 'x', AT)).toThrow(ScrapeError);
  });
});

function stats() {
  return buildStats(profile, badges, 'vaibhavdixit', AT);
}

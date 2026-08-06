import { describe, expect, it } from 'vitest';
import { buildStats } from './geeksforgeeks';
import { ScrapeError } from './types';
import fixture from './__fixtures__/geeksforgeeks-profile.json';

const AT = 1_700_000_000_000;

describe('geeksforgeeks', () => {
  it('parses a real auth-API response', () => {
    const stats = buildStats(fixture, 'sakshamg', AT);

    expect(stats.solved?.total).toBe(14);
    expect(stats.headline.find((h) => h.label === 'Score')?.value).toBe(28);
    expect(stats.headline.find((h) => h.label === 'Inst. rank')?.value).toBe('#3,846');
  });

  it('does not map the coding score onto rating', () => {
    // `score` is a points total, not an Elo rating; charting it as one would
    // misrepresent it against Codeforces and LeetCode ratings.
    expect(buildStats(fixture, 'sakshamg', AT).rating).toBeUndefined();
  });

  it('throws ScrapeError when the payload has no data', () => {
    expect(() => buildStats({ message: 'nope' }, 'x', AT)).toThrow(ScrapeError);
  });

  it('throws ScrapeError when data is present but carries no known stats', () => {
    expect(() => buildStats({ data: {} }, 'x', AT)).toThrow(ScrapeError);
  });
});

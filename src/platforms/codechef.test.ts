import { describe, expect, it } from 'vitest';
import { buildStats } from './codechef';
import { HandleNotFoundError, ScrapeError } from './types';

const AT = 1_700_000_000_000;

describe('codechef', () => {
  it('builds stats from extracted fields', () => {
    const stats = buildStats(
      { isProfilePage: true, rating: 3355, highestRating: 3445, stars: 7, solved: 632 },
      'gennady.korotkevich',
      AT,
    );

    expect(stats.rating).toMatchObject({ current: 3355, max: 3445, rank: '7★' });
    expect(stats.solved?.total).toBe(632);
    expect(stats.headline.find((h) => h.label === 'Stars')?.value).toBe('★★★★★★★');
  });

  it('treats a non-profile page as an unknown handle', () => {
    // CodeChef answers unknown usernames with its landing page and HTTP 200, so this
    // is the only signal that the user does not exist.
    expect(() => buildStats({ isProfilePage: false }, 'ghost', AT)).toThrow(HandleNotFoundError);
  });

  it('raises ScrapeError when a profile page yields no numbers', () => {
    // A layout change must be visible, never a silent zero that reads as lost progress.
    expect(() => buildStats({ isProfilePage: true }, 'someone', AT)).toThrow(ScrapeError);
  });

  it('still works for a user with a rating but no solved count', () => {
    const stats = buildStats({ isProfilePage: true, rating: 1500 }, 'someone', AT);
    expect(stats.solved).toBeUndefined();
    expect(stats.rating?.current).toBe(1500);
  });
});

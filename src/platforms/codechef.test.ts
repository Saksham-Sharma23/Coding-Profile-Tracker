import { describe, expect, it } from 'vitest';
import { buildStats } from './codechef';
import type { CodechefFields } from '@/offscreen/protocol';
import { HandleNotFoundError, ScrapeError } from './types';

const AT = 1_700_000_000_000;

/** A confirmed profile page carrying whatever numbers the test cares about. */
const profile = (fields: Partial<CodechefFields> = {}): CodechefFields => ({
  pageKind: 'profile',
  bytes: 180_425,
  ...fields,
});

describe('codechef', () => {
  it('builds stats from extracted fields', () => {
    const stats = buildStats(
      profile({ rating: 3355, highestRating: 3445, stars: 7, solved: 632 }),
      'gennady.korotkevich',
      AT,
    );

    expect(stats.rating).toMatchObject({ current: 3355, max: 3445, rank: '7★' });
    expect(stats.solved?.total).toBe(632);
    expect(stats.headline.find((h) => h.label === 'Stars')?.value).toBe('★★★★★★★');
  });

  it('treats the landing page as an unknown handle', () => {
    // CodeChef answers unknown usernames with its landing page and HTTP 200, so this
    // is the only signal that the user does not exist.
    expect(() => buildStats({ pageKind: 'not-found', bytes: 85_159 }, 'ghost', AT)).toThrow(
      HandleNotFoundError,
    );
  });

  it('reports an unrecognised page as a parser problem, not a missing user', () => {
    /*
     * The regression this whole change exists for. Page-kind used to be inferred from
     * whether a rating was present, so an interstitial, a redesign and an unrated
     * account all surfaced as "No codechef user named …" — which puts the blame on a
     * username that was correct and offers a "Fix username" button that cannot help.
     */
    const call = () =>
      buildStats(
        { pageKind: 'unrecognised', bytes: 4096, title: 'Just a moment...' },
        'gennady.korotkevich',
        AT,
      );

    expect(call).toThrow(ScrapeError);
    expect(call).not.toThrow(HandleNotFoundError);
    // The message has to name what actually arrived, or the next report is guesswork.
    expect(call).toThrow(/Just a moment/);
    expect(call).toThrow(/4,096 bytes/);
  });

  it('raises ScrapeError when a confirmed profile yields no numbers', () => {
    // A layout change must be visible, never a silent zero that reads as lost progress.
    expect(() => buildStats(profile(), 'someone', AT)).toThrow(ScrapeError);
  });

  it('still works for a user with a rating but no solved count', () => {
    const stats = buildStats(profile({ rating: 1500 }), 'someone', AT);
    expect(stats.solved).toBeUndefined();
    expect(stats.rating?.current).toBe(1500);
  });

  it('works for an unrated account, which has solves but no rating', () => {
    // Never entered a rated contest. A real user with real progress, and the case that
    // used to be reported as nonexistent.
    const stats = buildStats(profile({ solved: 4 }), 'newbie', AT);
    expect(stats.rating).toBeUndefined();
    expect(stats.solved?.total).toBe(4);
    expect(stats.headline).toEqual([{ label: 'Solved', value: 4, delta: 'solved' }]);
  });

  it('reports a genuine zero rather than treating it as missing', () => {
    // 0 is falsy; a truthiness check anywhere in this path would drop it and leave the
    // card blank instead of saying the account has solved nothing yet.
    const stats = buildStats(profile({ solved: 0 }), 'newbie', AT);
    expect(stats.solved?.total).toBe(0);
  });
});

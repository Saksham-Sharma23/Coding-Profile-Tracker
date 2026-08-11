import { describe, expect, it } from 'vitest';
import { buildStats, countSolved, extractSolved, unwrap } from './codeforces';
import { HandleNotFoundError } from './types';
import notFound from './__fixtures__/codeforces-notfound.json';
import status from './__fixtures__/codeforces-status.json';
import userInfo from './__fixtures__/codeforces-userinfo.json';

const AT = 1_700_000_000_000;

describe('codeforces', () => {
  it('unwraps a successful envelope', () => {
    const users = unwrap(userInfo, 'tourist');
    expect(users[0]?.handle).toBe('tourist');
    expect(users[0]?.rating).toBeGreaterThan(0);
  });

  it('maps the FAILED envelope from an unknown handle to HandleNotFoundError', () => {
    // This body arrives with HTTP 400, which is why the adapter allows that status.
    expect(() => unwrap(notFound, 'zzz_no_such_user_xyz123')).toThrow(HandleNotFoundError);
  });

  it('counts each solved problem once across repeat submissions', () => {
    const subs = [
      { verdict: 'OK', problem: { contestId: 1, index: 'A' } },
      { verdict: 'OK', problem: { contestId: 1, index: 'A' } }, // resubmission
      { verdict: 'WRONG_ANSWER', problem: { contestId: 1, index: 'B' } },
      { verdict: 'OK', problem: { contestId: 2, index: 'A' } },
    ];
    expect(countSolved(subs)).toBe(2);
  });

  it('parses a real submissions page without crashing', () => {
    const subs = unwrap(status, 'Fefer_Ivan');
    expect(Array.isArray(subs)).toBe(true);
    expect(countSolved(subs)).toBeGreaterThanOrEqual(0);
    expect(countSolved(subs)).toBeLessThanOrEqual(subs.length);
  });

  it('builds stats from a rated user', () => {
    const user = unwrap(userInfo, 'tourist')[0]!;
    const stats = buildStats(user, 42, AT);
    expect(stats.rating?.current).toBe(user.rating);
    expect(stats.solved?.total).toBe(42);
    expect(stats.headline[0]?.label).toBe('Rating');
  });

  it('shows Unrated instead of a rating for users who never competed', () => {
    const stats = buildStats({ handle: 'newbie' }, 0, AT);
    expect(stats.rating).toBeUndefined();
    expect(stats.headline[0]?.value).toBe('Unrated');
  });

  describe('extractSolved', () => {
    it('lists the problems behind the count, newest first', () => {
      const subs = [
        {
          verdict: 'OK',
          creationTimeSeconds: 100,
          problem: { contestId: 1, index: 'A', name: 'Theatre Square', rating: 1000, tags: ['math'] },
        },
        {
          verdict: 'OK',
          creationTimeSeconds: 300,
          problem: { contestId: 4, index: 'B', name: 'Before an Exam', rating: 1200 },
        },
      ];
      const solved = extractSolved(subs);

      expect(solved.map((p) => p.name)).toEqual(['Before an Exam', 'Theatre Square']);
      expect(solved[1]).toMatchObject({
        key: '1-A',
        url: 'https://codeforces.com/problemset/problem/1/A',
        solvedAt: 100_000,
        difficulty: 1000,
        tags: ['math'],
      });
    });

    it('records the first accepted submission, not the most recent revisit', () => {
      const subs = [
        { verdict: 'OK', creationTimeSeconds: 900, problem: { contestId: 1, index: 'A', name: 'X' } },
        { verdict: 'OK', creationTimeSeconds: 100, problem: { contestId: 1, index: 'A', name: 'X' } },
      ];
      const solved = extractSolved(subs);
      expect(solved).toHaveLength(1);
      expect(solved[0]!.solvedAt).toBe(100_000);
    });

    it('ignores unaccepted submissions and unnamed problems', () => {
      const subs = [
        { verdict: 'WRONG_ANSWER', creationTimeSeconds: 100, problem: { contestId: 1, index: 'A', name: 'X' } },
        { verdict: 'OK', creationTimeSeconds: 200, problem: { contestId: 2, index: 'B' } },
      ];
      expect(extractSolved(subs)).toEqual([]);
    });

    it('agrees with countSolved on the real fixture', () => {
      // The list and the count are derived from the same submissions, so a divergence
      // would mean the popup's number disagreed with its own problem list.
      const subs = unwrap(status, 'Fefer_Ivan');
      expect(extractSolved(subs)).toHaveLength(countSolved(subs));
    });

    it('links gym problems to the problemset root rather than a broken URL', () => {
      const solved = extractSolved([
        { verdict: 'OK', creationTimeSeconds: 100, problem: { name: 'Gym Problem' } },
      ]);
      expect(solved[0]?.url).toBe('https://codeforces.com/problemset');
      expect(solved[0]?.key).toBe('name:Gym Problem');
    });
  });
});

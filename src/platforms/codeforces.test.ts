import { describe, expect, it } from 'vitest';
import { buildStats, countSolved, unwrap } from './codeforces';
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
});

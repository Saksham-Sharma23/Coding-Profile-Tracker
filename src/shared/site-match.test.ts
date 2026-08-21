import { describe, expect, it } from 'vitest';
import manifest from '../../manifest.config';
import { BUILTIN_PLATFORM_IDS } from '@/platforms/types';
import { matchedHosts, platformForUrl } from './site-match';

describe('platformForUrl', () => {
  it('recognises every built-in platform', () => {
    expect(platformForUrl('https://leetcode.com/problems/two-sum/')).toBe('leetcode');
    expect(platformForUrl('https://codeforces.com/contest/1900')).toBe('codeforces');
    expect(platformForUrl('https://www.hackerrank.com/domains/algorithms')).toBe('hackerrank');
    expect(platformForUrl('https://www.codechef.com/users/tourist')).toBe('codechef');
    expect(platformForUrl('https://www.geeksforgeeks.org/dsa/')).toBe('geeksforgeeks');
  });

  it('ignores the path, query and fragment', () => {
    expect(platformForUrl('https://leetcode.com')).toBe('leetcode');
    expect(platformForUrl('https://leetcode.com/?tab=all#top')).toBe('leetcode');
  });

  it('matches subdomains, but only on a dot boundary', () => {
    expect(platformForUrl('https://www.leetcode.com/problems/')).toBe('leetcode');
    // The reason the check is anchored: a lookalike domain must not borrow the match.
    expect(platformForUrl('https://notleetcode.com/')).toBeUndefined();
    expect(platformForUrl('https://leetcode.com.evil.test/')).toBeUndefined();
  });

  it('is case-insensitive about the host', () => {
    expect(platformForUrl('https://LeetCode.COM/problems/')).toBe('leetcode');
  });

  it('returns nothing for an unrelated site', () => {
    expect(platformForUrl('https://example.com/')).toBeUndefined();
    expect(platformForUrl('https://mail.google.com/')).toBeUndefined();
  });

  it('treats an absent URL as the ordinary case, not an error', () => {
    // Without the `tabs` permission Chrome leaves tab.url undefined for every host the
    // extension has no permission for, so this is what most pages look like.
    expect(platformForUrl(undefined)).toBeUndefined();
    expect(platformForUrl('')).toBeUndefined();
  });

  it('refuses non-web schemes and unparseable input', () => {
    expect(platformForUrl('chrome://extensions')).toBeUndefined();
    expect(platformForUrl('about:blank')).toBeUndefined();
    expect(platformForUrl('javascript:alert(1)')).toBeUndefined();
    expect(platformForUrl('not a url')).toBeUndefined();
  });
});

describe('the host map and the manifest agree', () => {
  it('lists a host for every built-in platform', () => {
    // Otherwise a platform silently never matches, and the panel just looks broken on
    // that one site.
    const mapped = new Set(matchedHosts().map((host) => platformForUrl(`https://${host}/`)));
    expect([...mapped].sort()).toEqual([...BUILTIN_PLATFORM_IDS].sort());
  });

  it('maps only hosts the manifest already grants', () => {
    /*
     * The hosts here are a hand-kept copy of the manifest's, because a service worker
     * cannot read its own manifest's host_permissions back. This test is what stops the
     * copy from drifting: a host listed here but not granted would never have its
     * tab.url populated, so the match would silently never fire.
     */
    // defineManifest's return type is a union that also covers a Promise and a factory,
    // so it needs narrowing. The length check below is what keeps that from silently
    // degrading into a vacuous pass if the shape ever changes.
    const { host_permissions: patterns = [] } = manifest as { host_permissions?: string[] };
    const granted = patterns.map((pattern) => new URL(pattern).hostname);

    expect(granted.length).toBeGreaterThan(0);
    for (const host of matchedHosts()) {
      expect(granted).toContain(host);
    }
  });
});

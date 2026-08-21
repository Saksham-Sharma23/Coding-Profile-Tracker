/**
 * Which platform the page in front of you belongs to.
 *
 * Used by the side panel to surface the matching platform while you are solving on it.
 * Pure and synchronous — the caller supplies the URL, so nothing here touches a Chrome
 * API and it can be tested without a browser.
 */
import { type BuiltinPlatformId } from '@/platforms/types';

/**
 * Hostname to platform. Only built-ins appear: a user-defined platform has no site the
 * extension knows about, and guessing one from a profile URL template would be wrong
 * more often than right.
 *
 * These hosts duplicate the ones in manifest.config.ts, which is unavoidable — a
 * manifest is data, not something a service worker can read back. A test asserts the
 * two agree, so the copy cannot drift silently.
 */
const HOSTS: Readonly<Record<string, BuiltinPlatformId>> = {
  'leetcode.com': 'leetcode',
  'codeforces.com': 'codeforces',
  'www.hackerrank.com': 'hackerrank',
  'www.codechef.com': 'codechef',
  'www.geeksforgeeks.org': 'geeksforgeeks',
};

/**
 * The platform whose site `url` belongs to, or undefined for anything else.
 *
 * `undefined` in gives `undefined` out, which is the common case rather than an error:
 * without the `tabs` permission Chrome only fills in `tab.url` for hosts the extension
 * already holds a permission for, so every other page arrives here as undefined and is
 * genuinely invisible to the extension.
 */
export function platformForUrl(url: string | undefined): BuiltinPlatformId | undefined {
  if (!url) return undefined;

  let host: string;
  try {
    const parsed = new URL(url);
    // chrome:// and about: pages parse fine but are never a platform, and matching on
    // protocol here keeps a hostile-looking URL from reaching the lookup at all.
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    host = parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }

  const exact = HOSTS[host];
  if (exact) return exact;

  // Subdomains count: leetcode.com serves some regions from a subdomain, and a match on
  // "www.leetcode.com" should behave the same as the bare host. Anchored to a dot so
  // "notleetcode.com" cannot match "leetcode.com".
  for (const [known, platform] of Object.entries(HOSTS)) {
    if (host.endsWith(`.${known}`)) return platform;
  }
  return undefined;
}

/** The hosts this module recognises. Exported for the manifest cross-check test. */
export function matchedHosts(): string[] {
  return Object.keys(HOSTS);
}

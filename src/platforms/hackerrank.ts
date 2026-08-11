import { getJson } from './http';
import {
  FETCHED_PLATFORM,
  ScrapeError,
  type PlatformAdapter,
  type PlatformStats,
} from './types';

const PLATFORM = 'hackerrank' as const;
const BASE = 'https://www.hackerrank.com';

/** Unknown users 404 on both endpoints. */
const OPTIONS = { notFoundMeansMissingHandle: true };

interface HrBadge {
  badge_name?: string;
  badge_category?: string;
  stars?: number;
  total_stars?: number;
  solved?: number;
  level?: number;
}

interface HrBadgesResponse {
  status?: boolean;
  models?: HrBadge[];
}

interface HrProfileResponse {
  model?: {
    username?: string;
    level?: number;
    country?: string;
    school?: string;
    name?: string;
  };
}

/**
 * Stars are the number actually earned per badge (`total_stars` is the maximum
 * available), so the sum across badges is the user's real star count.
 */
export function buildStats(
  profile: HrProfileResponse,
  badgesBody: HrBadgesResponse | undefined,
  handle: string,
  fetchedAt: number,
): PlatformStats {
  const model = profile.model;
  if (!model) throw new ScrapeError(PLATFORM, 'profile response missing "model"');

  const all = badgesBody?.models ?? [];
  // Zero-star entries are domains the user has simply never started, so they are
  // listed by the API but are not badges the user holds.
  const earned = all.filter((badge) => (badge.stars ?? 0) > 0);
  const stars = earned.reduce((sum, badge) => sum + (badge.stars ?? 0), 0);

  const headline: PlatformStats['headline'] = [
    { label: 'Stars', value: stars },
    { label: 'Badges', value: earned.length },
  ];
  if (model.level !== undefined) headline.push({ label: 'Level', value: model.level });

  return {
    platform: PLATFORM,
    handle: model.username ?? handle,
    fetchedAt,
    headline,
    // Deliberately no `solved`: the MultiDomain "Problem Solving" badge overlaps the
    // per-language domain badges, so summing their `solved` counts would double-count
    // and corrupt the dashboard's cross-platform total. HackerRank does not publish
    // an unambiguous total either, so reporting none beats reporting a wrong one.
    ...(earned.length && {
      badges: earned
        .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
        .map((badge) => ({
          name: badge.badge_name ?? 'Badge',
          tier: `${badge.stars ?? 0}★`,
        })),
    }),
  };
}

export const hackerrank: PlatformAdapter = {
  id: PLATFORM,
  displayName: 'HackerRank',
  accent: '#2ec866',
  // Reports no solve count at all — its badges overlap, so any total derived from them
  // double-counts. Numerically a no-op, but it makes that a declared fact.
  capabilities: { ...FETCHED_PLATFORM, countsTowardTotal: false },
  profileUrl: (handle) => `${BASE}/profile/${encodeURIComponent(handle)}`,

  async fetchStats(handle, signal) {
    const fetchedAt = Date.now();
    const encoded = encodeURIComponent(handle);

    // Profile first: it is the existence check, and a 404 here means a bad handle.
    const profile = await getJson<HrProfileResponse>(
      PLATFORM,
      `${BASE}/rest/contests/master/hackers/${encoded}/profile`,
      handle,
      signal,
      OPTIONS,
    );

    // Badges are supplementary — a failure here should still yield a usable card
    // rather than sinking the whole fetch.
    let badges: HrBadgesResponse | undefined;
    try {
      badges = await getJson<HrBadgesResponse>(
        PLATFORM,
        `${BASE}/rest/hackers/${encoded}/badges`,
        handle,
        signal,
        OPTIONS,
      );
    } catch {
      badges = undefined;
    }

    return buildStats(profile, badges, handle, fetchedAt);
  },
};

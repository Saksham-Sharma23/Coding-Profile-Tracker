import { getText } from './http';
import { parseCodechefHtml } from '@/offscreen/client';
import type { CodechefFields } from '@/offscreen/protocol';
import {
  FETCHED_PLATFORM,
  HandleNotFoundError,
  ScrapeError,
  type PlatformAdapter,
  type PlatformStats,
} from './types';

const PLATFORM = 'codechef' as const;
const BASE = 'https://www.codechef.com';

export function buildStats(
  fields: CodechefFields,
  handle: string,
  fetchedAt: number,
): PlatformStats {
  // Unknown usernames get the generic landing page with HTTP 200, so a missing
  // .rating-number means "no such user" rather than a changed layout.
  if (!fields.isProfilePage) throw new HandleNotFoundError(PLATFORM, handle);

  // The page parsed as a profile but carried none of the numbers we read — that is a
  // layout change, and must surface as an error rather than a silent zero.
  if (fields.rating === undefined && fields.solved === undefined) {
    throw new ScrapeError(PLATFORM, 'profile page had neither rating nor solved count');
  }

  const headline: PlatformStats['headline'] = [];
  if (fields.rating !== undefined) {
    headline.push({ label: 'Rating', value: fields.rating, delta: 'rating' });
  }
  if (fields.solved !== undefined) {
    headline.push({ label: 'Solved', value: fields.solved, delta: 'solved' });
  }
  if (fields.stars !== undefined) {
    headline.push({ label: 'Stars', value: '★'.repeat(Math.min(fields.stars, 7)) });
  }

  return {
    platform: PLATFORM,
    handle,
    fetchedAt,
    headline,
    ...(fields.solved !== undefined && { solved: { total: fields.solved } }),
    ...(fields.rating !== undefined && {
      rating: {
        current: fields.rating,
        ...(fields.highestRating !== undefined && { max: fields.highestRating }),
        ...(fields.stars !== undefined && { rank: `${fields.stars}★` }),
        // Absent for users CodeChef currently lists as Inactive.
        ...(fields.globalRank !== undefined && { globalRank: fields.globalRank }),
      },
    }),
  };
}

export const codechef: PlatformAdapter = {
  id: PLATFORM,
  displayName: 'CodeChef',
  accent: '#5b4638',
  capabilities: { ...FETCHED_PLATFORM, rating: true },
  profileUrl: (handle) => `${BASE}/users/${encodeURIComponent(handle)}`,

  async fetchStats(handle, signal) {
    const fetchedAt = Date.now();
    const html = await getText(
      PLATFORM,
      `${BASE}/users/${encodeURIComponent(handle)}`,
      handle,
      signal,
    );
    // Service workers have no DOMParser; this round-trips through an offscreen document.
    const fields = await parseCodechefHtml(html);
    return buildStats(fields, handle, fetchedAt);
  },
};

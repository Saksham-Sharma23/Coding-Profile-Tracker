import { request } from './http';
import {
  FETCHED_PLATFORM,
  HandleNotFoundError,
  ScrapeError,
  type PlatformAdapter,
  type PlatformStats,
} from './types';

const PLATFORM = 'geeksforgeeks' as const;

/**
 * GeeksforGeeks serves profile pages as Next.js RSC streams with no embedded JSON
 * blob, but its auth API returns the same numbers as clean JSON — far more stable
 * than parsing flight data, and it avoids HTML scraping entirely.
 */
const API = 'https://authapi.geeksforgeeks.org/api-get/user-profile-info/';

/** An unknown handle comes back as HTTP 400, so that status is treated as missing. */
const OPTIONS = { allowStatuses: [400] };

interface GfgResponse {
  message?: string;
  data?: {
    name?: string;
    score?: number;
    monthly_score?: number;
    total_problems_solved?: number;
    institute_rank?: number;
    institute_name?: string;
    pod_solved_current_streak?: number;
    pod_solved_longest_streak?: number;
  };
}

export function buildStats(body: GfgResponse, handle: string, fetchedAt: number): PlatformStats {
  const data = body.data;
  if (!data) throw new ScrapeError(PLATFORM, body.message ?? 'response contained no data');

  const solved = data.total_problems_solved;
  const score = data.score;

  const headline: PlatformStats['headline'] = [];
  if (solved !== undefined) headline.push({ label: 'Solved', value: solved, delta: 'solved' });
  if (score !== undefined) headline.push({ label: 'Score', value: score });
  if (data.institute_rank) {
    headline.push({ label: 'Inst. rank', value: `#${data.institute_rank.toLocaleString()}` });
  }

  if (!headline.length) throw new ScrapeError(PLATFORM, 'no recognisable stats in response');

  return {
    platform: PLATFORM,
    handle,
    fetchedAt,
    headline,
    ...(solved !== undefined && { solved: { total: solved } }),
    // `score` is a coding score, not an Elo rating, so it is deliberately not mapped
    // onto `rating` — the dashboard's rating chart would misrepresent it.
    ...((data.pod_solved_current_streak !== undefined ||
      data.pod_solved_longest_streak !== undefined) && {
      activity: {
        ...(data.pod_solved_current_streak !== undefined && {
          streak: data.pod_solved_current_streak,
        }),
      },
    }),
  };
}

export const geeksforgeeks: PlatformAdapter = {
  id: PLATFORM,
  displayName: 'GeeksforGeeks',
  accent: '#2f8d46',
  // `score` is a points total, not an Elo rating, so it stays off the rating axis.
  capabilities: { ...FETCHED_PLATFORM },
  profileUrl: (handle) => `https://www.geeksforgeeks.org/user/${encodeURIComponent(handle)}/`,

  async fetchStats(handle, signal) {
    const fetchedAt = Date.now();
    const res = await request(
      PLATFORM,
      `${API}?handle=${encodeURIComponent(handle)}`,
      handle,
      signal,
      OPTIONS,
    );

    // A bad handle returns 400 with an entirely empty body, so parsing has to be
    // guarded — otherwise the user would see a raw JSON SyntaxError.
    const raw = await res.text();
    if (!raw.trim()) throw new HandleNotFoundError(PLATFORM, handle);

    let body: GfgResponse;
    try {
      body = JSON.parse(raw) as GfgResponse;
    } catch {
      throw new ScrapeError(PLATFORM, 'response was not JSON');
    }

    return buildStats(body, handle, fetchedAt);
  },
};

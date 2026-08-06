import { postJson } from './http';
import {
  HandleNotFoundError,
  ScrapeError,
  type PlatformAdapter,
  type PlatformStats,
} from './types';

const PLATFORM = 'leetcode' as const;
const ENDPOINT = 'https://leetcode.com/graphql/';

/**
 * One round trip for everything the UI needs. `userContestRanking` is a sibling of
 * `matchedUser` rather than a child, so it is queried with the same variable.
 */
const QUERY = `query trackerProfile($u: String!) {
  matchedUser(username: $u) {
    username
    profile { ranking reputation userAvatar realName }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    badges { id displayName icon }
    userCalendar { streak totalActiveDays submissionCalendar }
  }
  userContestRanking(username: $u) {
    attendedContestsCount
    rating
    globalRanking
    topPercentage
  }
}`;

interface LcResponse {
  data?: {
    matchedUser: {
      username: string;
      profile?: { ranking?: number; userAvatar?: string; realName?: string };
      submitStatsGlobal?: { acSubmissionNum?: { difficulty: string; count: number }[] };
      badges?: { id: string; displayName: string; icon: string }[];
      userCalendar?: { streak?: number; totalActiveDays?: number; submissionCalendar?: string };
    } | null;
    userContestRanking: {
      attendedContestsCount?: number;
      rating?: number;
      globalRanking?: number;
      topPercentage?: number;
    } | null;
  };
  errors?: { message: string }[];
}

/**
 * submissionCalendar arrives as a JSON *string* whose keys are UTC-midnight epoch
 * seconds. Converted to ISO dates so the dashboard heatmap can merge it with other
 * platforms without re-deriving timezones.
 */
export function parseCalendar(raw: string | undefined): Record<string, number> | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A malformed calendar should not sink an otherwise good profile fetch.
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;

  const out: Record<string, number> = {};
  for (const [seconds, count] of Object.entries(parsed as Record<string, unknown>)) {
    const ts = Number(seconds) * 1000;
    if (!Number.isFinite(ts) || typeof count !== 'number') continue;
    out[new Date(ts).toISOString().slice(0, 10)] = count;
  }
  return Object.keys(out).length ? out : undefined;
}

export function buildStats(body: LcResponse, handle: string, fetchedAt: number): PlatformStats {
  const user = body.data?.matchedUser;
  if (!user) {
    // Unknown users return HTTP 200 with matchedUser: null and an errors array.
    const message = body.errors?.[0]?.message ?? '';
    if (/does not exist/i.test(message) || body.data) {
      throw new HandleNotFoundError(PLATFORM, handle);
    }
    throw new ScrapeError(PLATFORM, message || 'matchedUser missing from response');
  }

  const counts = new Map(
    (user.submitStatsGlobal?.acSubmissionNum ?? []).map((entry) => [entry.difficulty, entry.count]),
  );
  const total = counts.get('All');
  if (total === undefined) {
    throw new ScrapeError(PLATFORM, 'submitStatsGlobal.acSubmissionNum missing "All"');
  }

  const contest = body.data?.userContestRanking;
  // Contest rating is a float (e.g. 3686.191); LeetCode itself displays it rounded.
  const contestRating = contest?.rating !== undefined ? Math.round(contest.rating) : undefined;

  const headline: PlatformStats['headline'] = [
    { label: 'Solved', value: total, delta: 'solved' },
  ];
  if (contestRating !== undefined) {
    headline.push({ label: 'Contest', value: contestRating, delta: 'rating' });
  }
  if (user.profile?.ranking) {
    headline.push({ label: 'Rank', value: `#${user.profile.ranking.toLocaleString()}` });
  }

  const calendar = parseCalendar(user.userCalendar?.submissionCalendar);

  return {
    platform: PLATFORM,
    handle: user.username,
    fetchedAt,
    headline,
    solved: {
      total,
      ...(counts.has('Easy') && { easy: counts.get('Easy') }),
      ...(counts.has('Medium') && { medium: counts.get('Medium') }),
      ...(counts.has('Hard') && { hard: counts.get('Hard') }),
    },
    // Users who have never entered a contest get userContestRanking: null.
    ...(contestRating !== undefined && {
      rating: {
        current: contestRating,
        ...(contest?.globalRanking !== undefined && { globalRank: contest.globalRanking }),
      },
    }),
    ...((user.userCalendar || calendar) && {
      activity: {
        ...(user.userCalendar?.streak !== undefined && { streak: user.userCalendar.streak }),
        ...(user.userCalendar?.totalActiveDays !== undefined && {
          activeDays: user.userCalendar.totalActiveDays,
        }),
        ...(calendar && { calendar }),
      },
    }),
    ...(user.badges?.length && {
      badges: user.badges.map((badge) => ({
        name: badge.displayName,
        // Icons come back as site-relative paths for first-party badges.
        icon: badge.icon?.startsWith('http') ? badge.icon : `https://leetcode.com${badge.icon}`,
      })),
    }),
  };
}

export const leetcode: PlatformAdapter = {
  id: PLATFORM,
  displayName: 'LeetCode',
  accent: '#ffa116',
  profileUrl: (handle) => `https://leetcode.com/u/${encodeURIComponent(handle)}/`,

  async fetchStats(handle, signal) {
    const fetchedAt = Date.now();
    const body = await postJson<LcResponse>(
      PLATFORM,
      ENDPOINT,
      handle,
      { query: QUERY, variables: { u: handle } },
      signal,
      // LeetCode is stricter with requests that carry no Referer.
      { Referer: 'https://leetcode.com' },
    );
    return buildStats(body, handle, fetchedAt);
  },
};

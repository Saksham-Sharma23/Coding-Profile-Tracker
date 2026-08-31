import { postJson } from './http';
import {
  FETCHED_PLATFORM,
  HandleNotFoundError,
  ScrapeError,
  type PlatformAdapter,
  type PlatformStats,
  type SolvedProblem,
} from './types';

const PLATFORM = 'leetcode' as const;
const ENDPOINT = 'https://leetcode.com/graphql/';

/**
 * LeetCode caps recentAcSubmissionList at 20 however large a limit is requested —
 * verified against 20, 50, 100 and 500, all of which returned exactly 20. So this is a
 * rolling window, not history: the stored list backfills the last 20 at install and
 * grows forward from there as refreshes pick up new solves.
 */
const RECENT_LIMIT = 20;

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
  recentAcSubmissionList(username: $u, limit: ${RECENT_LIMIT}) {
    id
    title
    titleSlug
    timestamp
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
    recentAcSubmissionList?:
      | ({ id?: string; title?: string; titleSlug?: string; timestamp?: string } | null)[]
      | null;
  };
  errors?: { message: string }[];
}

/**
 * Recent accepted submissions as solved problems.
 *
 * `timestamp` arrives as a *string* of epoch seconds. A submission whose slug or title
 * is missing is skipped rather than stored under a placeholder — a problem with no way
 * to link back to it is worse than one absent from the list.
 */
export function parseRecentSolved(body: LcResponse): SolvedProblem[] {
  const recent = body.data?.recentAcSubmissionList;
  if (!Array.isArray(recent)) return [];

  const byKey = new Map<string, SolvedProblem>();
  for (const entry of recent) {
    if (!entry?.titleSlug || !entry.title) continue;

    const seconds = Number(entry.timestamp);
    if (!Number.isFinite(seconds)) continue;

    // The same problem can appear twice in the window; keep the earliest solve.
    const existing = byKey.get(entry.titleSlug);
    const solvedAt = seconds * 1000;
    if (existing && existing.solvedAt <= solvedAt) continue;

    byKey.set(entry.titleSlug, {
      key: entry.titleSlug,
      name: entry.title,
      url: `https://leetcode.com/problems/${entry.titleSlug}/`,
      solvedAt,
    });
  }

  return [...byKey.values()].sort((a, b) => b.solvedAt - a.solvedAt);
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

/**
 * The user's *current* streak, counted back from today over the submission calendar.
 *
 * Deliberately not `userCalendar.streak`. Queried without a `year` argument — as this
 * adapter must, since the window is what makes the calendar useful — LeetCode scopes
 * that field to the current calendar year and reports the best run *within* it, not a
 * live streak. It therefore never falls back to 0 when the user stops solving: it sticks
 * at whatever the year's best run was, which is the "always 7 days" the UI kept showing.
 * It also collapses every January 1st regardless of a streak actually in flight.
 *
 * The calendar is real per-day data we already fetch and parse, so the streak is derived
 * from it instead: walk back a day at a time while each day has a submission.
 *
 * Today missing does not break a streak — it is not over until a whole day passes with
 * nothing — so counting starts at yesterday when today is empty. Days are UTC, matching
 * `isoDay` and the calendar's own keys.
 */
export function currentStreak(
  calendar: Record<string, number> | undefined,
  now: number,
): number | undefined {
  if (!calendar) return undefined;

  const day = (offset: number) => new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
  const solvedOn = (offset: number) => (calendar[day(offset)] ?? 0) > 0;

  // A day still in progress cannot end a streak; a day already past can.
  let offset = solvedOn(0) ? 0 : 1;
  if (!solvedOn(offset)) return 0;

  let streak = 0;
  while (solvedOn(offset)) {
    streak += 1;
    offset += 1;
  }
  return streak;
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
  const streak = currentStreak(calendar, fetchedAt);
  const recentSolved = parseRecentSolved(body);

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
        // Derived from the calendar rather than read off userCalendar.streak — see
        // currentStreak() for why that field is not a current streak at all.
        ...(streak !== undefined && { streak }),
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
    ...(recentSolved.length && { solvedProblems: recentSolved }),
  };
}

export const leetcode: PlatformAdapter = {
  id: PLATFORM,
  displayName: 'LeetCode',
  accent: '#ffa116',
  // The only platform publishing a per-day submission calendar.
  capabilities: { ...FETCHED_PLATFORM, rating: true, problemList: true, calendar: true },
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

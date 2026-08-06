/**
 * Upcoming contests.
 *
 * Not part of the PlatformAdapter contract: contests are not per-user profile stats,
 * they need no handle, and they are shared across every user of the extension. Keeping
 * them separate means a contest endpoint breaking can never affect a profile refresh.
 *
 * Both sources were probed live before this was written:
 *   - Codeforces `contest.list` is documented, and returns every contest ever run
 *     (~2,100 of them) with a `phase` field; only `BEFORE` is upcoming.
 *   - LeetCode's `topTwoContests` is undocumented but real, returning the next weekly
 *     and biweekly with epoch-second start times.
 * Only these two publish a clean upcoming-contest feed; the other three are skipped
 * rather than scraped.
 */
import { getJson, postJson } from './http';
import type { ContestItem } from '@/storage/schema';

const CF_URL = 'https://codeforces.com/api/contest.list?gym=false';
const LC_URL = 'https://leetcode.com/graphql/';

const LC_QUERY = `query { topTwoContests { title titleSlug startTime duration } }`;

export interface CfContest {
  id: number;
  name: string;
  phase: string;
  startTimeSeconds?: number;
  durationSeconds?: number;
}

export interface CfEnvelope {
  status: string;
  result?: CfContest[];
}

export interface LcContest {
  title: string;
  titleSlug: string;
  startTime: number;
  duration: number;
}

export interface LcEnvelope {
  data?: { topTwoContests?: (LcContest | null)[] | null };
}

/**
 * Upcoming Codeforces contests, soonest first.
 *
 * `phase` is the filter rather than the timestamp: a contest that is currently running
 * still has a start time in the past, and "upcoming" means not yet started.
 */
export function parseCodeforcesContests(body: CfEnvelope, now: number): ContestItem[] {
  if (body.status !== 'OK' || !Array.isArray(body.result)) return [];

  return body.result
    .filter((contest) => contest.phase === 'BEFORE' && contest.startTimeSeconds !== undefined)
    .map((contest) => ({
      platform: 'codeforces' as const,
      name: contest.name,
      url: `https://codeforces.com/contests/${contest.id}`,
      startsAt: contest.startTimeSeconds! * 1000,
      ...(contest.durationSeconds !== undefined && {
        durationMinutes: Math.round(contest.durationSeconds / 60),
      }),
    }))
    .filter((item) => item.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt);
}

export function parseLeetcodeContests(body: LcEnvelope, now: number): ContestItem[] {
  const contests = body.data?.topTwoContests;
  if (!Array.isArray(contests)) return [];

  return contests
    .filter((contest): contest is LcContest => Boolean(contest?.titleSlug && contest.startTime))
    .map((contest) => ({
      platform: 'leetcode' as const,
      name: contest.title,
      url: `https://leetcode.com/contest/${contest.titleSlug}/`,
      startsAt: contest.startTime * 1000,
      ...(contest.duration > 0 && { durationMinutes: Math.round(contest.duration / 60) }),
    }))
    .filter((item) => item.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt);
}

/**
 * Fetches both feeds independently. A source that fails contributes nothing rather
 * than failing the whole set — a countdown is a nicety, and half of one still helps.
 */
export async function fetchContests(signal: AbortSignal, now = Date.now()): Promise<ContestItem[]> {
  const results = await Promise.allSettled([
    getJson<CfEnvelope>('codeforces', CF_URL, '', signal).then((body) =>
      parseCodeforcesContests(body, now),
    ),
    postJson<LcEnvelope>('leetcode', LC_URL, '', { query: LC_QUERY }, signal).then((body) =>
      parseLeetcodeContests(body, now),
    ),
  ]);

  return results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .sort((a, b) => a.startsAt - b.startsAt);
}

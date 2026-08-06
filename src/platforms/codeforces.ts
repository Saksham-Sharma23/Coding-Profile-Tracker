import { getJson, sleep } from './http';
import {
  HandleNotFoundError,
  ScrapeError,
  type PlatformAdapter,
  type PlatformStats,
} from './types';

const PLATFORM = 'codeforces' as const;
const API = 'https://codeforces.com/api';

/** Codeforces asks for at most 1 request/second, so its calls are sequenced. */
const RATE_LIMIT_MS = 1100;

/** Codeforces signals a bad handle with 400 + a FAILED envelope, so 400 must be parsed. */
const CF_OPTIONS = { allowStatuses: [400] };

/** Submission history is fetched in pages; this bounds work for very prolific users. */
const PAGE_SIZE = 2000;
const MAX_SUBMISSIONS = 10000;

interface Envelope<T> {
  status: 'OK' | 'FAILED';
  result?: T;
  comment?: string;
}

/**
 * Imported JSON fixtures widen `status` to plain string, so unwrap accepts both this
 * and the narrow runtime shape.
 */
interface LooseEnvelope<T> {
  status: string;
  result?: T;
  comment?: string;
}

interface CfUser {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
}

interface CfSubmission {
  verdict?: string;
  problem?: { contestId?: number; index?: string; name?: string };
}

/**
 * Unknown handles come back as HTTP 400 carrying a `status: "FAILED"` envelope (not a
 * 404, and not a 200), so callers pass allowStatuses:[400] and unwrap the body here.
 */
export function unwrap<T>(body: Envelope<T> | LooseEnvelope<T>, handle: string): T {
  if (body.status !== 'OK' || body.result === undefined) {
    const comment = body.comment ?? 'unknown error';
    if (/not found/i.test(comment)) throw new HandleNotFoundError(PLATFORM, handle);
    throw new ScrapeError(PLATFORM, comment);
  }
  return body.result;
}

/**
 * A user may solve the same problem in multiple submissions, and practice submissions
 * carry the originating contest id, so identity is (contestId, index).
 */
export function countSolved(submissions: CfSubmission[]): number {
  const solved = new Set<string>();
  for (const sub of submissions) {
    if (sub.verdict !== 'OK' || !sub.problem) continue;
    const { contestId, index, name } = sub.problem;
    // Gym/acmsguru problems can lack contestId; fall back to the name so they still count.
    solved.add(contestId !== undefined && index ? `${contestId}-${index}` : `name:${name ?? ''}`);
  }
  return solved.size;
}

export function buildStats(user: CfUser, solvedCount: number, fetchedAt: number): PlatformStats {
  const headline: PlatformStats['headline'] = [];

  if (user.rating !== undefined) {
    headline.push({ label: 'Rating', value: user.rating, delta: 'rating' });
  } else {
    headline.push({ label: 'Rating', value: 'Unrated' });
  }
  headline.push({ label: 'Solved', value: solvedCount, delta: 'solved' });
  if (user.rank) headline.push({ label: 'Rank', value: titleCase(user.rank) });

  return {
    platform: PLATFORM,
    handle: user.handle,
    fetchedAt,
    headline,
    solved: { total: solvedCount },
    ...(user.rating !== undefined && {
      rating: {
        current: user.rating,
        ...(user.maxRating !== undefined && { max: user.maxRating }),
        ...(user.rank && { rank: titleCase(user.rank) }),
      },
    }),
  };
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

export const codeforces: PlatformAdapter = {
  id: PLATFORM,
  displayName: 'Codeforces',
  accent: '#1f8acb',
  profileUrl: (handle) => `https://codeforces.com/profile/${encodeURIComponent(handle)}`,

  async fetchStats(handle, signal) {
    const fetchedAt = Date.now();

    const info = unwrap(
      await getJson<Envelope<CfUser[]>>(
        PLATFORM,
        `${API}/user.info?handles=${encodeURIComponent(handle)}`,
        handle,
        signal,
        CF_OPTIONS,
      ),
      handle,
    );
    const user = info[0];
    if (!user) throw new HandleNotFoundError(PLATFORM, handle);

    // Paginate submissions, stopping at the first short page.
    const submissions: CfSubmission[] = [];
    for (let from = 1; from <= MAX_SUBMISSIONS; from += PAGE_SIZE) {
      await sleep(RATE_LIMIT_MS);
      const page = unwrap(
        await getJson<Envelope<CfSubmission[]>>(
          PLATFORM,
          `${API}/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${PAGE_SIZE}`,
          handle,
          signal,
          CF_OPTIONS,
        ),
        handle,
      );
      submissions.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return buildStats(user, countSolved(submissions), fetchedAt);
  },
};

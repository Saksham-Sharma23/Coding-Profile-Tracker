export const BUILTIN_PLATFORM_IDS = [
  'leetcode',
  'codeforces',
  'hackerrank',
  'codechef',
  'geeksforgeeks',
] as const;

/** The five platforms that ship with a hand-written adapter. */
export type BuiltinPlatformId = (typeof BUILTIN_PLATFORM_IDS)[number];

/** Prefix reserved for user-defined platforms, so an id can never collide with a builtin. */
export const CUSTOM_PREFIX = 'custom:';

/**
 * Any platform id — a builtin, or a user-defined `custom:<slug>-<hex>`.
 *
 * Deliberately plain `string` rather than `BuiltinPlatformId | (string & {})`: that
 * union is structurally just `string`, so it buys editor autocomplete and no safety at
 * all. Nothing in the codebase switches exhaustively on a platform id, so there is
 * nothing for a closed union to protect. Use `BuiltinPlatformId` where the closed set
 * is genuinely required — the content scripts and the contest parsers.
 */
export type PlatformId = string;

/**
 * What a platform can actually do, replacing the hardcoded allowlists that used to live
 * in the dashboard and shared/solved.ts. Declared per adapter so a user-defined platform
 * can describe itself without any UI needing to know its id.
 */
export interface PlatformCapabilities {
  /** A true Elo-style rating, eligible for the shared rating axis. GfG's "score" is not. */
  rating: boolean;
  /** Publishes which problems were solved, not merely how many. */
  problemList: boolean;
  /** Publishes a per-day submission calendar for the heatmap. */
  calendar: boolean;
  /** Its solve count rolls into the cross-platform total and the daily goal. */
  countsTowardTotal: boolean;
  /** Needs a username to fetch. False for hand-kept counters. */
  requiresHandle: boolean;
  /** Refreshed over the network. False for hand-kept counters. */
  fetchable: boolean;
  /**
   * "Solved today" may fall back to the most recent earlier point when yesterday is
   * missing. True only for manual counters, where a missing day genuinely means zero;
   * for a fetched platform it means "we did not look", which must not be guessed at.
   */
  baselineFromLastKnown: boolean;
}

/** Capabilities for a normal fetched platform; adapters override what differs. */
export const FETCHED_PLATFORM: PlatformCapabilities = {
  rating: false,
  problemList: false,
  calendar: false,
  countsTowardTotal: true,
  requiresHandle: true,
  fetchable: true,
  baselineFromLastKnown: false,
};

/**
 * One problem the user has solved.
 *
 * `key` is the platform's own stable identity for the problem (a LeetCode slug, a
 * Codeforces `contestId-index`), used to merge repeat solves rather than accumulate
 * duplicates. `solvedAt` is the earliest accepted submission we have seen — exact for
 * Codeforces, which returns full history, and first-observed for anything discovered
 * through a periodic poll.
 */
export interface SolvedProblem {
  key: string;
  name: string;
  url: string;
  solvedAt: number;
  /** A Codeforces problem rating or a LeetCode difficulty. Display only. */
  difficulty?: string | number;
  tags?: string[];
}

/** A single number the popup card shows front and center. */
export interface HeadlineStat {
  label: string;
  value: string | number;
  /** Which normalized field this tracks, so the UI can compute a delta from history. */
  delta?: 'solved' | 'rating';
}

/**
 * The normalized shape every adapter produces. Counter-style platforms (LeetCode)
 * and rating-style ones (Codeforces) both fit here, so no UI component ever needs
 * to know which platform it is rendering.
 */
export interface PlatformStats {
  platform: PlatformId;
  handle: string;
  fetchedAt: number;
  /** 2-3 most important numbers. Each adapter decides its own. Must be non-empty. */
  headline: HeadlineStat[];
  solved?: { total: number; easy?: number; medium?: number; hard?: number };
  rating?: { current: number; max?: number; rank?: string; globalRank?: number };
  activity?: {
    streak?: number;
    activeDays?: number;
    /** ISO date (YYYY-MM-DD) -> submission count. */
    calendar?: Record<string, number>;
  };
  badges?: { name: string; tier?: string; icon?: string }[];
  /**
   * Problems this fetch saw solved — named apart from `solved`, which holds counts.
   * Adapters return whatever the platform gave them (complete history for Codeforces,
   * the last 20 for LeetCode) and the repo merges it into the accumulated list rather
   * than replacing it. Deliberately not kept on the snapshot, which is a point-in-time
   * record, whereas this list is cumulative.
   */
  solvedProblems?: SolvedProblem[];
}

export interface PlatformAdapter {
  id: PlatformId;
  displayName: string;
  /** Brand color used for the card accent. Decoration only, never a data mark. */
  accent: string;
  capabilities: PlatformCapabilities;
  /** Undefined when the platform has no public profile page to link to. */
  profileUrl?(handle: string): string;
  fetchStats(handle: string, signal: AbortSignal): Promise<PlatformStats>;
}

/** Thrown when a handle does not exist on the platform. Not retryable. */
export class HandleNotFoundError extends Error {
  readonly kind = 'handle-not-found';
  constructor(platform: PlatformId, handle: string) {
    super(`No ${platform} user named "${handle}"`);
    this.name = 'HandleNotFoundError';
  }
}

/**
 * Thrown when a response parsed but did not contain the fields we expect — i.e. the
 * platform changed its format. Surfaced to the user as "parser needs updating" rather
 * than being swallowed into a zero, because a silently wrong number reads as lost
 * progress and is far worse than a visible error.
 */
export class ScrapeError extends Error {
  readonly kind = 'scrape-failed';
  constructor(platform: PlatformId, detail: string) {
    super(`${platform} response format changed — parser needs updating (${detail})`);
    this.name = 'ScrapeError';
  }
}

/** Thrown for network/HTTP failures. Retryable. */
export class FetchError extends Error {
  readonly kind = 'fetch-failed';
  constructor(platform: PlatformId, detail: string) {
    super(`Could not reach ${platform}: ${detail}`);
    this.name = 'FetchError';
  }
}

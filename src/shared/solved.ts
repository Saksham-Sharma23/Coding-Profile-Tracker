/**
 * Queries over the accumulated solved-problem lists.
 *
 * Coverage is uneven by platform and the UI has to say so rather than imply the list
 * is complete: Codeforces returns full submission history, LeetCode returns only its
 * 20 most recent (so its list backfills 20 and grows forward from install), and the
 * other three publish no per-problem feed at all.
 */
import type { PlatformAdapter, PlatformId, SolvedProblem } from '@/platforms/types';
import { isoDay } from '@/storage/repo';
import type { TrackerState } from '@/storage/schema';

/** Platforms that expose which problems were solved, not just how many. */
export const PROBLEM_LIST_PLATFORMS: PlatformId[] = ['codeforces', 'leetcode'];

export interface SolvedEntry extends SolvedProblem {
  platform: PlatformId;
  platformName: string;
  accent: string;
}

/** Every stored problem across the tracked platforms, newest first. */
export function allSolved(state: TrackerState, tracked: PlatformAdapter[]): SolvedEntry[] {
  const entries: SolvedEntry[] = [];

  for (const adapter of tracked) {
    for (const problem of state.solved[adapter.id] ?? []) {
      entries.push({
        ...problem,
        platform: adapter.id,
        platformName: adapter.displayName,
        accent: adapter.accent,
      });
    }
  }

  return entries.sort((a, b) => b.solvedAt - a.solvedAt);
}

/** Problems solved on one UTC day — the same day boundary history and streaks use. */
export function solvedOnDay(entries: SolvedEntry[], day: string): SolvedEntry[] {
  return entries.filter((entry) => isoDay(entry.solvedAt) === day);
}

/**
 * Substring match over problem name, platform and tags. Case-insensitive, and every
 * whitespace-separated term must match, so "dp 1600" narrows rather than widens.
 */
export function filterSolved(entries: SolvedEntry[], query: string): SolvedEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;

  return entries.filter((entry) => {
    const haystack = [entry.name, entry.platformName, String(entry.difficulty ?? ''), ...(entry.tags ?? [])]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Which tracked platforms can contribute a problem list, so the UI can explain a
 * short list instead of leaving the user wondering where their CodeChef solves went.
 */
export function coverageNote(tracked: PlatformAdapter[]): string | undefined {
  const missing = tracked
    .filter((adapter) => !PROBLEM_LIST_PLATFORMS.includes(adapter.id))
    .map((adapter) => adapter.displayName);

  if (!missing.length) return undefined;
  const list =
    missing.length === 1
      ? missing[0]!
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]!}`;
  return `${list} ${missing.length === 1 ? 'does' : 'do'} not publish which problems were solved, only totals.`;
}

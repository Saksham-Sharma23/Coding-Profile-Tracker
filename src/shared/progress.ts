/**
 * Derived numbers shared by the popup, the dashboard and the toolbar badge. Pure
 * functions over stored state, so they can be unit-tested — and so the badge in the
 * service worker and the number in the popup can never disagree.
 *
 * Days are UTC throughout, matching `isoDay` and the per-day calendars the platforms
 * themselves publish. That means the daily counter rolls over at UTC midnight rather
 * than local midnight. Switching to local days would desync these numbers from the
 * platform calendars and from every history point already stored, which is a worse
 * trade than a rollover at the wrong hour.
 */
import type { PlatformAdapter, PlatformId } from '@/platforms/types';
import { pointForDay, previousDay, previousPoint } from '@/storage/repo';
import type { HistoryPoint, TrackerState } from '@/storage/schema';

/**
 * Platforms whose solve count rolls into the cross-platform figures.
 *
 * Excluded by declaration rather than by name: HackerRank's badges overlap, so any
 * total derived from them double-counts, and a user-defined sheet like Striver's is a
 * curated list *of* LeetCode problems — counting both counts the same work twice.
 */
function counted(adapters: PlatformAdapter[]): PlatformAdapter[] {
  return adapters.filter((adapter) => adapter.capabilities.countsTowardTotal);
}

export interface Trend {
  /** Structurally the viz layer's Point, declared here so shared/ never imports ui/. */
  points: { d: string; v: number }[];
  /** Names the series, so the sparkline needs no legend. */
  label: string;
}

/**
 * The trailing window of history for one platform, as a sparkline series.
 *
 * Rating wins when the platform records one, because a rating moves both ways and is
 * the more interesting line; solve counts only ever climb.
 */
export function trendFor(history: HistoryPoint[] | undefined, days = 30): Trend | undefined {
  if (!history?.length) return undefined;

  const window = history.slice(-days);
  const rated = window.filter((point) => point.rating !== undefined);
  if (rated.length >= 2) {
    return { points: rated.map((point) => ({ d: point.d, v: point.rating! })), label: 'Rating' };
  }

  const solved = window.filter((point) => point.solved !== undefined);
  if (solved.length) {
    return { points: solved.map((point) => ({ d: point.d, v: point.solved! })), label: 'Solved' };
  }
  return undefined;
}

export interface TodayProgress {
  /** Undefined when no tracked platform has a baseline to measure against. */
  solved?: number;
  /** True when at least one platform with a solve count had no yesterday baseline. */
  partial: boolean;
}

/**
 * Problems solved today, measured against each platform's history point for
 * *yesterday specifically*.
 *
 * The obvious anchor — the most recent earlier point — is wrong: after a three-day
 * gap it reports three days of work as today's. A platform with no yesterday point is
 * left out and flagged rather than guessed at.
 */
export function solvedToday(
  state: TrackerState,
  adapters: PlatformAdapter[],
  today: string,
): TodayProgress {
  const yesterday = previousDay(today);
  let solved: number | undefined;
  let partial = false;

  // Filtered before the loop, not inside it: an excluded platform must not be able to
  // set `partial` either, or the UI apologises for leaving out a number it never wanted.
  for (const adapter of counted(adapters)) {
    const current = state.snapshots[adapter.id]?.stats?.solved?.total;
    if (current === undefined) continue;

    const series = state.history[adapter.id];
    /*
     * A hand-kept counter with no point for yesterday has not moved — that is knowable,
     * so it falls back to the last value on record. A fetched platform's gap means "we
     * did not look", which is not knowable and stays flagged.
     *
     * The fallback is the previous *point*, never 0: a counter set to 191 last week
     * would otherwise report all 191 as solved today.
     */
    const baseline =
      pointForDay(series, yesterday)?.solved ??
      (adapter.capabilities.baselineFromLastKnown ? previousPoint(series, today)?.solved : undefined);

    if (baseline === undefined) {
      partial = true;
      continue;
    }

    // A count that went down means the platform recounted, not that work was undone.
    solved = (solved ?? 0) + Math.max(0, current - baseline);
  }

  return { ...(solved !== undefined && { solved }), partial };
}

export interface StreakInfo {
  days: number;
  /** The platform the streak came from. Named because there is no cross-platform streak. */
  source: string;
}

/**
 * The longest current streak, attributed to the platform that reported it.
 *
 * Only LeetCode and GeeksforGeeks publish a streak. Presenting the max as a bare
 * "12-day streak" would read as a cross-platform figure the tracker cannot compute,
 * so the source is part of the value.
 */
export function bestStreak(state: TrackerState, adapters: PlatformAdapter[]): StreakInfo | undefined {
  let best: StreakInfo | undefined;

  for (const adapter of adapters) {
    const days = state.snapshots[adapter.id]?.stats?.activity?.streak;
    if (days === undefined || days <= 0) continue;
    if (!best || days > best.days) best = { days, source: adapter.displayName };
  }
  return best;
}

/**
 * Problems solved across the tracked platforms that declare they count.
 *
 * See `counted()` for who is left out and why. HackerRank has always been excluded;
 * it reports no solve count at all, so declaring it changed no number.
 */
export function totalSolved(state: TrackerState, adapters: PlatformAdapter[]): number {
  return counted(adapters).reduce(
    (sum, adapter) => sum + (state.snapshots[adapter.id]?.stats?.solved?.total ?? 0),
    0,
  );
}

/**
 * Platforms to show, in display order: not switched off, and identified well enough to
 * have something to show.
 *
 * The handle check is conditional on the platform actually needing one. A hand-kept
 * counter has no username by definition, so an unconditional check would hide every
 * user-defined counter from the popup, the dashboard and the badge alike.
 */
export function visiblePlatforms(
  state: TrackerState,
  ordered: PlatformAdapter[],
): PlatformAdapter[] {
  return ordered.filter((adapter) => {
    if (state.settings.enabled[adapter.id] === false) return false;
    if (!adapter.capabilities.requiresHandle) return true;
    return Boolean(state.settings.handles[adapter.id]?.trim());
  });
}

/**
 * The expanded list is authoritative, with no "auto-open when there is only one"
 * special case: that made the single row impossible to collapse, since collapsing it
 * emptied the list and the rule re-opened it. Instead the options page seeds this list
 * the first time handles are saved, so a new user still lands on an open row.
 */
export function isExpanded(expanded: PlatformId[], id: PlatformId): boolean {
  return expanded.includes(id);
}

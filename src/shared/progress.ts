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
import { pointForDay, previousDay } from '@/storage/repo';
import type { HistoryPoint, TrackerState } from '@/storage/schema';

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

  for (const adapter of adapters) {
    const current = state.snapshots[adapter.id]?.stats?.solved?.total;
    if (current === undefined) continue;

    const baseline = pointForDay(state.history[adapter.id], yesterday)?.solved;
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
 * Problems solved across every tracked platform.
 *
 * HackerRank contributes nothing by design — its badges overlap, so any total derived
 * from them double-counts. See the README.
 */
export function totalSolved(state: TrackerState, adapters: PlatformAdapter[]): number {
  return adapters.reduce(
    (sum, adapter) => sum + (state.snapshots[adapter.id]?.stats?.solved?.total ?? 0),
    0,
  );
}

/** Platforms with a handle set and not explicitly switched off, in display order. */
export function visiblePlatforms(
  state: TrackerState,
  ordered: PlatformAdapter[],
): PlatformAdapter[] {
  return ordered.filter(
    (adapter) =>
      state.settings.handles[adapter.id]?.trim() && state.settings.enabled[adapter.id] !== false,
  );
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

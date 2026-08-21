/**
 * Turns a stored descriptor into a PlatformAdapter, so a user-defined platform is
 * indistinguishable from a builtin everywhere downstream — the popup, the dashboard,
 * the badge, the reminder and the storage layer all keep working unchanged.
 *
 * Descriptors are validated in `storage/custom.ts` before they ever reach here, so
 * this file trusts its input and does no re-checking.
 */
import type { CustomPlatform } from '@/storage/custom';
import {
  FETCHED_PLATFORM,
  type PlatformAdapter,
  type PlatformCapabilities,
  type PlatformStats,
} from '../types';

/** Well past any real sheet, and low enough that a fat-fingered paste cannot corrupt a chart. */
export const MAX_MANUAL_COUNT = 1_000_000;

/** A hand-kept count can never be negative and is always a whole number of problems. */
export function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_MANUAL_COUNT, Math.max(0, Math.round(value)));
}

/**
 * What a hand-kept counter reports.
 *
 * Shaped exactly like a fetched platform's stats, because the count belongs in
 * `solved.total` — where `appendHistory`, `Delta`, `Sparkline`, `previousPoint`,
 * `solvedToday`, the badge and the reminder already read it. Storing it on the
 * descriptor instead would mean reimplementing every one of those.
 *
 * The target is deliberately absent from `headline`: `45 of 191` is one control, not
 * two statistics, and `ManualCounter` renders it straight from the descriptor.
 */
export function manualStats(
  def: CustomPlatform,
  total: number,
  fetchedAt: number,
): PlatformStats {
  return {
    platform: def.id,
    // No account stands behind a hand-kept counter. The empty handle is also what keeps
    // recordSuccess's account-identity guard from ever firing on one.
    handle: '',
    fetchedAt,
    headline: [{ label: 'Solved', value: total, delta: 'solved' }],
    solved: { total },
  };
}

function capabilitiesFor(def: CustomPlatform): PlatformCapabilities {
  if (def.source !== 'manual') {
    return { ...FETCHED_PLATFORM, countsTowardTotal: def.countsTowardTotal };
  }

  return {
    ...FETCHED_PLATFORM,
    countsTowardTotal: def.countsTowardTotal,
    requiresHandle: false,
    fetchable: false,
    /*
     * True only for manual counters. A day with no history point means the count did
     * not move, which is knowable; for a fetched platform the same gap means "we did
     * not look", which is not, and must never be guessed at.
     */
    baselineFromLastKnown: true,
  };
}

export function adapterFor(def: CustomPlatform): PlatformAdapter {
  const profileTemplate = def.profileUrlTemplate;

  return {
    id: def.id,
    displayName: def.displayName,
    accent: def.accent,
    capabilities: capabilitiesFor(def),

    ...(profileTemplate && {
      profileUrl: (handle: string) =>
        profileTemplate.replace(/\{handle\}/g, encodeURIComponent(handle)),
    }),

    /*
     * Unreachable for a manual counter: `activePlatforms` filters on `fetchable`, and
     * `refreshAll` intersects even an explicit retry with that same set, so no path
     * reaches this and `recordFailure` can never paint a red error on a good counter.
     *
     * json and scrape descriptors can still arrive through an imported file before
     * their phases land. They reject rather than resolving zeros — a visible error is
     * the honest answer, and a zero would read as lost progress.
     */
    fetchStats: () =>
      Promise.reject(
        new Error(
          def.source === 'manual'
            ? `${def.displayName} is a hand-kept counter and is never fetched`
            : `${def.displayName} needs a newer version of this extension to fetch`,
        ),
      ),
  };
}

export function customAdapters(defs: readonly CustomPlatform[]): PlatformAdapter[] {
  return defs.map(adapterFor);
}

import type { ContestItem, TrackerState } from '@/storage/schema';
import type { PlatformAdapter } from '@/platforms/types';

/**
 * "2d 4h", "4h 20m", "18m". Two units at most — a countdown measured to the second
 * invites watching it, and the contest page is one click away for anyone who cares
 * that precisely.
 */
export function formatCountdown(msUntil: number): string {
  if (msUntil <= 0) return 'now';

  const minutes = Math.floor(msUntil / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}

/**
 * The soonest upcoming contest on a platform the user actually tracks.
 *
 * Contests are fetched for everyone, but showing a Codeforces round to someone who
 * only uses LeetCode is noise, so the filter happens at display time rather than at
 * fetch time — that way enabling a platform surfaces its contests immediately instead
 * of waiting up to six hours for the next contest fetch.
 */
export function nextContest(
  state: TrackerState,
  tracked: PlatformAdapter[],
  now: number,
): ContestItem | undefined {
  const ids = new Set(tracked.map((adapter) => adapter.id));
  return state.contests?.items
    .filter((item) => ids.has(item.platform) && item.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)[0];
}

import { readState } from '@/storage/repo';

export const ALARM_NAME = 'tracker-refresh';

/**
 * chrome.alarms rather than setInterval: the service worker is torn down after ~30s
 * idle, which would kill any timer we held in memory.
 */
export async function scheduleRefresh(): Promise<void> {
  const { settings } = await readState();
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.refreshMinutes,
    delayInMinutes: settings.refreshMinutes,
  });
}

/**
 * True when the newest successful snapshot is older than one refresh interval, used
 * to decide whether opening the popup should trigger a fetch.
 */
export async function isStale(): Promise<boolean> {
  const state = await readState();
  const timestamps = Object.values(state.snapshots)
    // A hand-kept counter stamps `fetchedAt` when the user clicks +1, which is not
    // evidence that anything was fetched. Counting it would let one click suppress the
    // popup's auto-refresh of every real platform for a whole interval.
    .filter((snap) => !snap?.manual)
    .map((snap) => snap?.fetchedAt ?? 0)
    .filter((ts) => ts > 0);

  if (!timestamps.length) return true;
  const newest = Math.max(...timestamps);
  return Date.now() - newest > state.settings.refreshMinutes * 60_000;
}

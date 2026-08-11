import type { PlatformId, PlatformStats } from '@/platforms/types';
import {
  clampRefresh,
  defaultState,
  migrate,
  type FailureKind,
  type HistoryPoint,
  type Settings,
  type SolvedProblem,
  type TrackerState,
} from './schema';

const KEY = 'tracker';

/** Roughly three years of daily points; well under quota even for all five platforms. */
const MAX_HISTORY_POINTS = 1100;

/**
 * Bounds the solved list for very prolific users. At roughly 120 bytes a problem this
 * is ~600KB per platform worst case, which `unlimitedStorage` covers comfortably.
 */
const MAX_SOLVED_PER_PLATFORM = 5000;

/**
 * The service worker is torn down after ~30s idle, so nothing is cached in module
 * scope — every read goes to chrome.storage.
 */
export async function readState(): Promise<TrackerState> {
  const bag = await chrome.storage.local.get(KEY);
  return migrate(bag[KEY]);
}

async function writeState(state: TrackerState): Promise<void> {
  await chrome.storage.local.set({ [KEY]: state });
}

/**
 * Read-modify-write. Refreshes run adapters concurrently and each writes its own
 * result, so mutations must re-read inside the update to avoid clobbering a sibling
 * that landed first.
 */
export async function updateState(
  mutate: (state: TrackerState) => TrackerState | void,
): Promise<TrackerState> {
  const current = await readState();
  const next = mutate(current) ?? current;
  await writeState(next);
  return next;
}

export async function getSettings(): Promise<Settings> {
  return (await readState()).settings;
}

export async function saveSettings(partial: Partial<Settings>): Promise<TrackerState> {
  return updateState((state) => {
    state.settings = {
      ...state.settings,
      ...partial,
      refreshMinutes: clampRefresh(partial.refreshMinutes ?? state.settings.refreshMinutes),
    };
  });
}

/** Platforms that have a handle set and are not explicitly disabled. */
export function activePlatforms(settings: Settings): PlatformId[] {
  return Object.entries(settings.handles)
    .filter(([id, handle]) => handle?.trim() && settings.enabled[id as PlatformId] !== false)
    .map(([id]) => id as PlatformId);
}

export async function recordSuccess(stats: PlatformStats): Promise<void> {
  await updateState((state) => {
    // The problem list is cumulative, so it must not ride along inside the snapshot —
    // each fetch carries only a slice, and storing that would keep overwriting it.
    const { solvedProblems, ...rest } = stats;
    state.snapshots[stats.platform] = { status: 'ok', stats: rest, fetchedAt: stats.fetchedAt };
    appendHistory(state, rest);
    if (solvedProblems?.length) mergeSolved(state, stats.platform, solvedProblems);
  });
}

/**
 * Folds newly seen problems into the stored list.
 *
 * Merge rather than replace: LeetCode only ever returns its 20 most recent accepted
 * submissions, so a replace would shrink the list to 20 on every refresh and throw
 * away everything accumulated since install. Codeforces does return full history, but
 * the same merge handles it correctly, so there is one code path rather than two.
 *
 * An existing entry keeps its earlier `solvedAt` — that is the first time we saw the
 * problem accepted, and re-solving it later should not restate when it was done.
 */
export function mergeSolved(
  state: TrackerState,
  platform: PlatformId,
  incoming: SolvedProblem[],
): void {
  const byKey = new Map<string, SolvedProblem>();
  for (const problem of state.solved[platform] ?? []) byKey.set(problem.key, problem);

  for (const problem of incoming) {
    const existing = byKey.get(problem.key);
    byKey.set(
      problem.key,
      existing ? { ...problem, solvedAt: Math.min(existing.solvedAt, problem.solvedAt) } : problem,
    );
  }

  state.solved[platform] = [...byKey.values()]
    .sort((a, b) => b.solvedAt - a.solvedAt)
    .slice(0, MAX_SOLVED_PER_PLATFORM);
}

/**
 * Keeps the previous stats on the snapshot so the UI can still show last-known
 * numbers alongside the error rather than blanking the card. `kind` lets the UI
 * offer the right remedy — retry for a network fault, "fix the handle" for a bad
 * username — instead of one generic message.
 */
export async function recordFailure(
  platform: PlatformId,
  error: string,
  kind?: FailureKind,
): Promise<void> {
  await updateState((state) => {
    const previous = state.snapshots[platform];
    state.snapshots[platform] = {
      status: 'error',
      error,
      ...(kind && { kind }),
      stats: previous?.stats,
      fetchedAt: previous?.fetchedAt ?? 0,
    };
  });
}

export function isoDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** The ISO day before `day`. Pure string/UTC math, so it never drifts with local time. */
export function previousDay(day: string): string {
  return isoDay(Date.parse(`${day}T00:00:00Z`) - 86_400_000);
}

function appendHistory(state: TrackerState, stats: PlatformStats): void {
  const solved = stats.solved?.total;
  const rating = stats.rating?.current;
  if (solved === undefined && rating === undefined) return;

  const day = isoDay(stats.fetchedAt);
  const series = state.history[stats.platform] ?? [];
  const point: HistoryPoint = { d: day, ...(solved !== undefined && { solved }), ...(rating !== undefined && { rating }) };

  const last = series[series.length - 1];
  if (last?.d === day) {
    series[series.length - 1] = point;
  } else {
    series.push(point);
  }

  state.history[stats.platform] = series.slice(-MAX_HISTORY_POINTS);
}

/**
 * Most recent point strictly older than today, used for the "+3 today" delta.
 * Returns undefined when there is no prior day to compare against.
 */
export function previousPoint(series: HistoryPoint[] | undefined, today: string): HistoryPoint | undefined {
  if (!series?.length) return undefined;
  for (let i = series.length - 1; i >= 0; i--) {
    const point = series[i];
    if (point && point.d < today) return point;
  }
  return undefined;
}

/**
 * The point for one exact day, or undefined.
 *
 * "Solved today" must anchor here and not on previousPoint(): that returns the most
 * recent point *strictly older* than today, so after a three-day gap it would report
 * three days of work as today's. Callers show "—" when this returns undefined rather
 * than inventing a number.
 */
export function pointForDay(
  series: HistoryPoint[] | undefined,
  day: string,
): HistoryPoint | undefined {
  if (!series?.length) return undefined;
  for (let i = series.length - 1; i >= 0; i--) {
    const point = series[i];
    if (point?.d === day) return point;
    // Series is chronological, so anything older than the target means it is absent.
    if (point && point.d < day) return undefined;
  }
  return undefined;
}

export async function clearAll(): Promise<void> {
  await writeState(defaultState());
}

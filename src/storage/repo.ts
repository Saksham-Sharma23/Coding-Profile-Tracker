import { clampCount, manualStats } from '@/platforms/custom/adapter';
import type { PlatformAdapter, PlatformId, PlatformStats } from '@/platforms/types';
import {
  clampRefresh,
  defaultState,
  migrate,
  type CustomPlatform,
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
 * Serializes every read-modify-write against storage.
 *
 * Re-reading inside the callback is necessary but nowhere near sufficient. `readState`
 * and `writeState` are both async and the whole blob is rewritten each time, so two
 * overlapping updates each read the same "before" state and the second write silently
 * discards the first — losing a snapshot, its history point and its solved list. That is
 * not a rare interleaving: `refreshAll` runs adapters through `Promise.all`, and the
 * 400ms stagger only spaces out request *starts*, not the responses, which arrive
 * together routinely.
 *
 * The tail of this promise chain is the lock. Awaiting it before reading means each
 * mutation observes the previous one's write, turning concurrent callers into a queue.
 * Module scope is the right lifetime — it lives exactly as long as the worker or page,
 * and a teardown mid-chain leaves storage consistent because each link writes whole.
 *
 * This orders writes *within* one context. A UI page and the service worker still write
 * independently; `chrome.storage.onChanged` is what keeps those in step.
 */
let queue: Promise<unknown> = Promise.resolve();

export async function updateState(
  mutate: (state: TrackerState) => TrackerState | void,
): Promise<TrackerState> {
  // Chained regardless of outcome: one failed mutation must not wedge every later one.
  const run = queue.then(async () => {
    const current = await readState();
    const next = mutate(current) ?? current;
    await writeState(next);
    return next;
  });

  queue = run.catch(() => undefined);
  return run;
}

export async function getSettings(): Promise<Settings> {
  return (await readState()).settings;
}

export async function saveSettings(partial: Partial<Settings>): Promise<TrackerState> {
  return updateState((state) => {
    // A changed handle means everything stored for that platform describes a different
    // person, so it is discarded before the new handle lands. See clearPlatformData.
    if (partial.handles) {
      for (const id of changedHandles(state.settings.handles, partial.handles)) {
        clearPlatformData(state, id);
      }
    }

    state.settings = {
      ...state.settings,
      ...partial,
      refreshMinutes: clampRefresh(partial.refreshMinutes ?? state.settings.refreshMinutes),
    };
  });
}

/**
 * Compares two handles as the platforms themselves do — trimmed and case-insensitively.
 *
 * The asymmetry matters: reporting "same" when it changed merely leaves the existing
 * behaviour, while reporting "changed" when it did not destroys real history. Codeforces
 * is genuinely case-insensitive, so retyping `Tourist` for `tourist` must not count.
 */
function sameHandle(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/**
 * Platforms whose handle differs between two settings bags, including ones added or
 * cleared — a removed handle also orphans its data.
 */
export function changedHandles(
  before: Partial<Record<PlatformId, string>>,
  after: Partial<Record<PlatformId, string>>,
): PlatformId[] {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...ids].filter((id) => !sameHandle(before[id], after[id]));
}

/**
 * Drops everything accumulated for one platform, keeping its settings and descriptor.
 *
 * This exists because the data bags are keyed by platform alone, with no record of whose
 * account they describe. mergeSolved() deliberately accumulates rather than replaces —
 * LeetCode only ever returns the 20 most recent solves, so replacing would shrink the
 * list on every refresh — which means that without this, pointing a platform at a
 * different username silently blends two people's solve lists and continues one person's
 * history series with another's totals.
 */
export function clearPlatformData(state: TrackerState, platform: PlatformId): void {
  delete state.snapshots[platform];
  delete state.history[platform];
  delete state.solved[platform];
}

/** Whether a platform has anything stored that changing its handle would discard. */
export function hasStoredData(state: TrackerState, platform: PlatformId): boolean {
  return Boolean(
    state.snapshots[platform] || state.history[platform]?.length || state.solved[platform]?.length,
  );
}

/**
 * Platforms a refresh should actually fetch.
 *
 * Driven by the adapter list rather than the handles bag: a hand-kept counter has no
 * handle at all, so iterating handles could not even see it, and it must be excluded
 * anyway because there is nothing to fetch.
 */
export function activePlatforms(settings: Settings, adapters: PlatformAdapter[]): PlatformId[] {
  return adapters
    .filter((adapter) => {
      if (!adapter.capabilities.fetchable) return false;
      if (settings.enabled[adapter.id] === false) return false;
      return !adapter.capabilities.requiresHandle || settings.handles[adapter.id]?.trim();
    })
    .map((adapter) => adapter.id);
}

/**
 * Adds or replaces a descriptor, operating on the freshly-read array rather than on
 * whatever React last rendered — writes are whole-blob last-wins, so building the new
 * list from stale component state would drop a concurrent change.
 */
export async function upsertCustomPlatform(def: CustomPlatform): Promise<void> {
  await updateState((state) => {
    const list = state.settings.custom;
    const at = list.findIndex((each) => each.id === def.id);
    if (at >= 0) list[at] = def;
    else list.push(def);
  });
}

/**
 * The only path that deletes custom data. migrate() deliberately never prunes a
 * `custom:` key, so this has to clear every bag explicitly.
 */
export async function removeCustomPlatform(id: PlatformId): Promise<void> {
  await updateState((state) => {
    const { settings } = state;
    settings.custom = settings.custom.filter((def) => def.id !== id);
    settings.order = settings.order.filter((each) => each !== id);
    settings.expanded = settings.expanded.filter((each) => each !== id);

    for (const bag of [settings.handles, settings.enabled, state.snapshots, state.history, state.solved]) {
      delete (bag as Record<string, unknown>)[id];
    }
  });
}

export async function recordSuccess(stats: PlatformStats): Promise<void> {
  await updateState((state) => applyStats(state, stats));
}

/**
 * Files one platform's stats into the state. Synchronous on purpose: callers wrap it in
 * a single `updateState` so a read-modify-write cycle covers the whole operation, and a
 * hand-kept `+1` can resolve against freshly-read storage inside the same cycle.
 */
function applyStats(
  state: TrackerState,
  stats: PlatformStats,
  options: { manual?: boolean } = {},
): void {
  /*
   * Second line of defence behind saveSettings. That is the chokepoint for the normal
   * path, but a handle can also arrive through an imported file, so the identity of
   * the data is re-checked against what actually came back before anything is merged
   * into it. Only fires when a previous fetch recorded a different account.
   */
  const owner = state.snapshots[stats.platform]?.stats?.handle;
  if (owner && !sameHandle(owner, stats.handle)) {
    clearPlatformData(state, stats.platform);
  }

  // The problem list is cumulative, so it must not ride along inside the snapshot —
  // each fetch carries only a slice, and storing that would keep overwriting it.
  const { solvedProblems, ...rest } = stats;
  state.snapshots[stats.platform] = {
    status: 'ok',
    stats: rest,
    fetchedAt: stats.fetchedAt,
    ...(options.manual && { manual: true }),
  };
  appendHistory(state, rest);
  if (solvedProblems?.length) mergeSolved(state, stats.platform, solvedProblems);
}

/**
 * Writes a hand-kept count, either absolute or as a change against the stored value.
 *
 * `next` may be a function precisely because `updateState` is read-modify-write: a `+1`
 * derived from whatever React last rendered would lose a concurrent increment made from
 * the other open surface, since writes are whole-blob last-wins. Passing a resolver lets
 * it run against storage that was read inside this same cycle. The UI disables its
 * buttons while the write is in flight as well — this is the part that has to be correct
 * even when it does not.
 *
 * Routing through `applyStats` means `appendHistory` overwrites the same UTC day, so
 * five `+1`s today produce one history point at `+5` rather than five points.
 */
export async function recordManual(
  def: CustomPlatform,
  next: number | ((current: number) => number),
): Promise<void> {
  await updateState((state) => {
    const current = state.snapshots[def.id]?.stats?.solved?.total ?? 0;
    const total = clampCount(typeof next === 'function' ? next(current) : next);
    applyStats(state, manualStats(def, total, Date.now()), { manual: true });
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

/**
 * The UTC day for a timestamp.
 *
 * Guarded because `new Date(NaN).toISOString()` throws a RangeError rather than
 * returning anything. `migrate()` validates settings thoroughly but passes `snapshots`,
 * `history` and `solved` through untouched, so a hand-edited or truncated import can
 * carry a non-numeric `fetchedAt` or `solvedAt` straight into a render — where an
 * exception blanks the whole surface. Falling back to the epoch keeps the bad row
 * visibly wrong instead of taking the page down with it.
 */
export function isoDay(ts: number): string {
  const day = new Date(ts);
  if (Number.isNaN(day.getTime())) return '1970-01-01';
  return day.toISOString().slice(0, 10);
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

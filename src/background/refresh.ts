import { fetchContests } from '@/platforms/contests';
import { allAdapters, getAdapter } from '@/platforms/registry';
import type { PlatformId } from '@/platforms/types';
import { activePlatforms, readState, recordFailure, recordSuccess, updateState } from '@/storage/repo';
import type { FailureKind, TrackerState } from '@/storage/schema';
import { updateBadge } from './badge';

/** Contests change weekly, so they are refetched far less often than profiles. */
const CONTEST_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * The adapter error classes carry a `kind` discriminant that used to be thrown away
 * here — only `err.message` reached storage. Preserving it lets the UI pick a remedy:
 * retry a network fault, point at the options page for a bad handle, report a parser
 * break as a parser break.
 */
function failureKind(err: unknown): FailureKind | undefined {
  if (!(err instanceof Error)) return undefined;
  const kind = (err as { kind?: unknown }).kind;
  return kind === 'handle-not-found' || kind === 'scrape-failed' || kind === 'fetch-failed'
    ? kind
    : undefined;
}

/** Per-platform ceiling. Codeforces paginates, so this is generous. */
const TIMEOUT_MS = 30_000;

/** Small gap between platforms so we never fire five requests at once. */
const STAGGER_MS = 400;

export interface RefreshOutcome {
  platform: PlatformId;
  ok: boolean;
  error?: string;
}

/**
 * Refreshes one platform and persists the result immediately. Never throws — a
 * failure is recorded on the snapshot so one broken platform cannot blank the popup
 * or abort its siblings.
 */
export async function refreshPlatform(platform: PlatformId, handle: string): Promise<RefreshOutcome> {
  const adapter = getAdapter(platform, []);
  if (!adapter) {
    return { platform, ok: false, error: 'Platform not supported yet' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const stats = await adapter.fetchStats(handle.trim(), controller.signal);
    await recordSuccess(stats);
    return { platform, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(platform, message, failureKind(err));
    return { platform, ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Refreshes every configured platform. Results are written per-platform as they land,
 * so the popup can update progressively rather than waiting for the slowest one.
 */
export async function refreshAll(only?: PlatformId[]): Promise<RefreshOutcome[]> {
  const state = await readState();
  // Phase 0/1: no custom adapters are built yet.
  const adapters = allAdapters([]);
  const fetchable = new Set(activePlatforms(state.settings, adapters));

  // Even an explicit `only` is intersected with what is actually fetchable, so a Retry
  // click on a hand-kept counter cannot start a pointless request.
  const targets = (only ?? [...fetchable]).filter((id) => fetchable.has(id));

  const tasks = targets.map(async (platform, index) => {
    await new Promise((resolve) => setTimeout(resolve, index * STAGGER_MS));
    return refreshPlatform(platform, state.settings.handles[platform] ?? '');
  });

  const outcomes = await Promise.all(tasks);
  await refreshContests(state);
  await updateBadge();
  return outcomes;
}

/**
 * Contests ride along with the profile refresh rather than getting an alarm of their
 * own — the schedule is already running, and a second alarm to watch a list that
 * changes weekly would be pure overhead.
 */
async function refreshContests(state: TrackerState): Promise<void> {
  const age = Date.now() - (state.contests?.fetchedAt ?? 0);
  if (state.contests && age < CONTEST_MAX_AGE_MS) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const items = await fetchContests(controller.signal);
    await updateState((next) => {
      next.contests = { fetchedAt: Date.now(), items };
    });
  } catch {
    // A countdown is a nicety. Failing to fetch it must never mark a refresh failed
    // or disturb the profile snapshots that just landed.
  } finally {
    clearTimeout(timer);
  }
}

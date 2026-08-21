import {
  BUILTIN_PLATFORM_IDS,
  type PlatformId,
  type PlatformStats,
  type SolvedProblem,
} from '@/platforms/types';
import { isCustomId, sanitizeCustom, type CustomPlatform } from './custom';

export type { CustomPlatform, SolvedProblem };

export const SCHEMA_VERSION = 5;

/** Why a fetch failed, kept so the UI can offer the right remedy per case. */
export type FailureKind = 'handle-not-found' | 'scrape-failed' | 'fetch-failed';

export interface Snapshot {
  status: 'ok' | 'error';
  stats?: PlatformStats;
  error?: string;
  /**
   * Absent on snapshots written before v2, and on errors that carried no typed
   * kind (a bare Error). The UI degrades to the plain message in both cases.
   */
  kind?: FailureKind;
  fetchedAt: number;
  /**
   * Written by hand rather than fetched. `fetchedAt` then records when the user last
   * touched the counter, which is not evidence that anything was fetched — so
   * `isStale()` skips these, or a single `+1` would suppress the popup's auto-refresh
   * of every real platform for a whole interval.
   */
  manual?: true;
}

/** One point per platform per day. Same-day writes overwrite rather than append. */
export interface HistoryPoint {
  /** ISO date, YYYY-MM-DD. */
  d: string;
  solved?: number;
  rating?: number;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface ReminderSettings {
  enabled: boolean;
  /** Local hour, 0-23. */
  hour: number;
}

export interface Settings {
  handles: Partial<Record<PlatformId, string>>;
  enabled: Partial<Record<PlatformId, boolean>>;
  refreshMinutes: number;
  /** Display order. Ids missing from this list fall to the end in registry order. */
  order: PlatformId[];
  /** Rows the popup shows expanded. Persisted so a focused platform stays open. */
  expanded: PlatformId[];
  /** Problems per day to aim for. 0 disables the goal UI entirely. */
  dailyGoal: number;
  theme: ThemePref;
  reminder: ReminderSettings;
  /** Platforms the user defined themselves. */
  custom: CustomPlatform[];
}

export interface ContestItem {
  platform: PlatformId;
  name: string;
  url: string;
  /** Epoch ms of the contest start. */
  startsAt: number;
  durationMinutes?: number;
}

export interface TrackerState {
  version: number;
  settings: Settings;
  snapshots: Partial<Record<PlatformId, Snapshot>>;
  history: Partial<Record<PlatformId, HistoryPoint[]>>;
  /** Usernames sniffed off logged-in pages by content scripts. Suggestions only. */
  detected: Partial<Record<PlatformId, string>>;
  /** Upcoming contests. Not per-platform profile data, so deliberately not in snapshots. */
  contests?: { fetchedAt: number; items: ContestItem[] };
  /**
   * Problems solved, newest first. Accumulated across refreshes rather than replaced,
   * because LeetCode only ever returns its 20 most recent — so this list is built up
   * over time and must never be overwritten with one fetch's worth.
   */
  solved: Partial<Record<PlatformId, SolvedProblem[]>>;
}

/** Floor exists to stay polite to platforms that have no documented rate limit. */
export const MIN_REFRESH_MINUTES = 15;
export const DEFAULT_REFRESH_MINUTES = 60;
export const DEFAULT_REMINDER_HOUR = 20;

export function defaultSettings(): Settings {
  return {
    handles: {},
    enabled: {},
    refreshMinutes: DEFAULT_REFRESH_MINUTES,
    order: [],
    expanded: [],
    dailyGoal: 0,
    theme: 'system',
    reminder: { enabled: false, hour: DEFAULT_REMINDER_HOUR },
    custom: [],
  };
}

export function defaultState(): TrackerState {
  return {
    version: SCHEMA_VERSION,
    settings: defaultSettings(),
    snapshots: {},
    history: {},
    detected: {},
    solved: {},
  };
}

/**
 * Brings any older stored blob up to SCHEMA_VERSION. Every step so far is additive —
 * each version only introduced new fields with defaults — so one merge covers v0
 * through v5 alike, and an upgrade never discards data the user has accumulated. If a
 * future version ever needs to *reshape* stored data, this becomes a version-branched
 * chain instead.
 *
 * This also doubles as the import validator, so it is a trust boundary: everything it
 * returns may have come from a file someone else wrote.
 */
export function migrate(raw: unknown): TrackerState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;

  const state = raw as Partial<TrackerState>;
  const settings: Partial<Settings> = state.settings ?? {};

  // The custom descriptors live inside the blob being migrated, so they have to be
  // validated FIRST — everything below is gated on the set of ids they define.
  const custom = sanitizeCustom(settings.custom);
  const known = new Set<string>([...BUILTIN_PLATFORM_IDS, ...custom.map((def) => def.id)]);

  const merged: TrackerState = {
    version: SCHEMA_VERSION,
    settings: {
      handles: settings.handles ?? {},
      enabled: settings.enabled ?? {},
      refreshMinutes: clampRefresh(settings.refreshMinutes),
      order: sanitizeIds(settings.order, known),
      expanded: sanitizeIds(settings.expanded, known),
      dailyGoal: clampGoal(settings.dailyGoal),
      theme: isThemePref(settings.theme) ? settings.theme : 'system',
      reminder: sanitizeReminder(settings.reminder),
      custom,
    },
    snapshots: state.snapshots ?? {},
    history: state.history ?? {},
    detected: state.detected ?? {},
    solved: state.solved ?? {},
    ...(state.contests && { contests: state.contests }),
  };

  /*
   * Drop keys for platforms that no longer exist so stale data cannot resurface —
   * but never for a `custom:` id.
   *
   * migrate() runs on every read, so if sanitizeCustom ever rejects a descriptor (a
   * hand-edited export, a future tightening of the rules) a strict prune would turn a
   * validation bug into permanent, silent loss of the user's history and hand-kept
   * counts. Orphaned custom data is invisible to the UI and costs a few bytes;
   * deleting a year of someone's progress is unrecoverable. Actual deletion is
   * explicit, via removeCustomPlatform().
   */
  for (const bag of [
    merged.settings.handles,
    merged.settings.enabled,
    merged.snapshots,
    merged.history,
    merged.detected,
    merged.solved,
  ]) {
    for (const key of Object.keys(bag)) {
      if (!known.has(key) && !isCustomId(key)) delete (bag as Record<string, unknown>)[key];
    }
  }
  if (merged.contests) {
    merged.contests = {
      fetchedAt: merged.contests.fetchedAt ?? 0,
      items: (merged.contests.items ?? []).filter((item) => known.has(item.platform)),
    };
  }

  return merged;
}

export function clampRefresh(minutes: unknown): number {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return DEFAULT_REFRESH_MINUTES;
  return Math.max(MIN_REFRESH_MINUTES, Math.round(minutes));
}

export function clampGoal(goal: unknown): number {
  if (typeof goal !== 'number' || !Number.isFinite(goal) || goal <= 0) return 0;
  return Math.min(500, Math.round(goal));
}

export function isThemePref(value: unknown): value is ThemePref {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Keeps only ids that name a real platform — builtin or user-defined — de-duplicated,
 * so a stale blob cannot smuggle junk in. `known` is passed in rather than rebuilt,
 * because the custom set is only computed part-way through migrate().
 */
function sanitizeIds(value: unknown, known: ReadonlySet<string>): PlatformId[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((id): id is PlatformId => typeof id === 'string' && known.has(id))),
  ];
}

function sanitizeReminder(value: unknown): ReminderSettings {
  if (!value || typeof value !== 'object') {
    return { enabled: false, hour: DEFAULT_REMINDER_HOUR };
  }

  const reminder = value as Partial<ReminderSettings>;
  const hour = reminder.hour;
  return {
    enabled: reminder.enabled === true,
    hour:
      typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23
        ? hour
        : DEFAULT_REMINDER_HOUR,
  };
}

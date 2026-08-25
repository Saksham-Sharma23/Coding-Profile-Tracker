import { problemDir } from './repo-layout';
import type { CapturedSubmission, PushedRecord } from './types';

export const MANIFEST_VERSION = 1;

/** One row of the repo's own index. Everything the root README needs to be regenerated. */
export interface ManifestEntry {
  platform: string;
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  difficulty: string;
  tags: string[];
  /** Directory holding the problem, relative to the repo root. */
  dir: string;
  lang: string;
  /** Epoch ms of the accepted submission. */
  solvedAt: number;
  submissionId: string;
}

export interface RepoManifest {
  version: number;
  generator: string;
  updatedAt: number;
  problems: ManifestEntry[];
}

/**
 * The repo is the source of truth, not this browser profile.
 *
 * Committing an index means a reinstall, a second machine, or a cleared profile can
 * recover what has already been pushed by reading one file — instead of re-committing a
 * year of solutions on top of themselves. It is also the only way the root README can be
 * regenerated without walking the whole tree over the API.
 */
export function emptyManifest(): RepoManifest {
  return {
    version: MANIFEST_VERSION,
    generator: 'Coding Profile Tracker',
    updatedAt: 0,
    problems: [],
  };
}

export function parseManifest(json: string): RepoManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    // A hand-edited or truncated manifest must not wedge the push path. Starting from
    // empty risks re-pushing, which is harmless — the commit is an update in place.
    return emptyManifest();
  }

  if (!raw || typeof raw !== 'object') return emptyManifest();
  const manifest = raw as Partial<RepoManifest>;

  return {
    version: typeof manifest.version === 'number' ? manifest.version : MANIFEST_VERSION,
    generator: manifest.generator ?? 'Coding Profile Tracker',
    updatedAt: typeof manifest.updatedAt === 'number' ? manifest.updatedAt : 0,
    problems: Array.isArray(manifest.problems)
      ? manifest.problems.filter(isEntry).map((entry) => ({ ...entry, tags: entry.tags ?? [] }))
      : [],
  };
}

function isEntry(value: unknown): value is ManifestEntry {
  const entry = value as Partial<ManifestEntry> | null;
  return Boolean(entry && typeof entry.titleSlug === 'string' && typeof entry.dir === 'string');
}

export function renderManifest(manifest: RepoManifest): string {
  // Sorted by problem number so the file diffs cleanly: a new problem inserts one block
  // rather than reordering everything below it.
  const problems = [...manifest.problems].sort(compareEntries);
  return `${JSON.stringify({ ...manifest, problems }, null, 2)}\n`;
}

export function entryFor(submission: CapturedSubmission): ManifestEntry {
  return {
    platform: submission.platform,
    questionFrontendId: submission.questionFrontendId,
    titleSlug: submission.titleSlug,
    title: submission.title,
    difficulty: submission.difficulty,
    tags: submission.tags,
    dir: problemDir(submission),
    lang: submission.lang,
    solvedAt: submission.solvedAt,
    submissionId: submission.submissionId,
  };
}

/**
 * Adds or replaces an entry, keyed by slug.
 *
 * Re-solving a problem — often in a different language — overwrites rather than appends,
 * matching the commit, which updates the same directory in place. `solvedAt` keeps the
 * earlier value for the same reason mergeSolved() does in storage/repo.ts: it records
 * when the problem was first cracked, and solving it again does not change that.
 */
export function upsertEntry(manifest: RepoManifest, entry: ManifestEntry): RepoManifest {
  const existing = manifest.problems.find((each) => each.titleSlug === entry.titleSlug);
  const merged: ManifestEntry = existing
    ? { ...entry, solvedAt: Math.min(existing.solvedAt, entry.solvedAt) }
    : entry;

  return {
    ...manifest,
    updatedAt: Date.now(),
    problems: [
      ...manifest.problems.filter((each) => each.titleSlug !== entry.titleSlug),
      merged,
    ].sort(compareEntries),
  };
}

/** Rebuilds the local `pushed` map from a manifest read out of the repo. */
export function pushedFromManifest(manifest: RepoManifest): Record<string, PushedRecord> {
  const pushed: Record<string, PushedRecord> = {};
  for (const entry of manifest.problems) {
    pushed[entry.titleSlug] = {
      dir: entry.dir,
      submissionId: entry.submissionId,
      pushedAt: entry.solvedAt,
    };
  }
  return pushed;
}

function compareEntries(a: ManifestEntry, b: ManifestEntry): number {
  const left = Number(a.questionFrontendId);
  const right = Number(b.questionFrontendId);
  // Non-numeric ids (contest-only problems) sort after the numbered ones, by slug.
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  if (Number.isFinite(left)) return -1;
  if (Number.isFinite(right)) return 1;
  return a.titleSlug.localeCompare(b.titleSlug);
}

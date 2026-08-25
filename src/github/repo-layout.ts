import type { CapturedSubmission } from './types';

/** Machine-readable index committed alongside the solutions. See readManifest(). */
export const MANIFEST_PATH = '.tracker/manifest.json';

export const ROOT_README = 'README.md';

/**
 * LeetCode language slug -> file extension.
 *
 * Keyed by the slug LeetCode returns in `lang.name`, which is not always the obvious
 * one: `python3` rather than `python`, `golang` rather than `go`, and three separate
 * SQL dialects that all deserve `.sql`. An unknown slug falls back to `.txt` rather
 * than guessing — a wrongly-named file is worse than an unstyled one, and a new
 * LeetCode language should not lose someone's solution.
 */
const EXTENSIONS: Record<string, string> = {
  python: 'py',
  python3: 'py',
  pythondata: 'py',
  cpp: 'cpp',
  c: 'c',
  java: 'java',
  csharp: 'cs',
  javascript: 'js',
  typescript: 'ts',
  golang: 'go',
  rust: 'rs',
  kotlin: 'kt',
  swift: 'swift',
  ruby: 'rb',
  scala: 'scala',
  php: 'php',
  dart: 'dart',
  racket: 'rkt',
  erlang: 'erl',
  elixir: 'ex',
  bash: 'sh',
  mysql: 'sql',
  mssql: 'sql',
  oraclesql: 'sql',
  postgresql: 'sql',
};

/** Human-readable language names for the README columns. */
const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python',
  python3: 'Python 3',
  pythondata: 'Pandas',
  cpp: 'C++',
  c: 'C',
  java: 'Java',
  csharp: 'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  golang: 'Go',
  rust: 'Rust',
  kotlin: 'Kotlin',
  swift: 'Swift',
  ruby: 'Ruby',
  scala: 'Scala',
  php: 'PHP',
  dart: 'Dart',
  racket: 'Racket',
  erlang: 'Erlang',
  elixir: 'Elixir',
  bash: 'Bash',
  mysql: 'MySQL',
  mssql: 'MS SQL Server',
  oraclesql: 'Oracle SQL',
  postgresql: 'PostgreSQL',
};

export function extensionFor(lang: string): string {
  return EXTENSIONS[lang.toLowerCase()] ?? 'txt';
}

export function languageLabel(lang: string): string {
  return LANGUAGE_LABELS[lang.toLowerCase()] ?? lang;
}

/**
 * Makes a slug safe as a path segment.
 *
 * LeetCode slugs are already lowercase-and-hyphens, so this is a guard against a
 * malformed or hostile value reaching a repo path — notably `..`, which could otherwise
 * write outside the platform directory when Git resolves the tree.
 */
export function sanitizeSlug(slug: string): string {
  const cleaned = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'untitled';
}

/**
 * Zero-pads the displayed question number so directories sort correctly.
 *
 * Four digits covers LeetCode's current range with room to spare. Ids that are not
 * numeric at all (some contest-only problems) keep their raw text, sanitized — they
 * sort oddly, which is better than colliding under a shared placeholder.
 */
export function paddedId(questionFrontendId: string): string {
  const trimmed = questionFrontendId.trim();
  return /^\d+$/.test(trimmed) ? trimmed.padStart(4, '0') : sanitizeSlug(trimmed);
}

/** e.g. `leetcode/0001-two-sum`. Stable across re-solves, so an update lands in place. */
export function problemDir(submission: CapturedSubmission): string {
  return `${submission.platform}/${paddedId(submission.questionFrontendId)}-${sanitizeSlug(
    submission.titleSlug,
  )}`;
}

export function solutionPath(submission: CapturedSubmission): string {
  return `${problemDir(submission)}/solution.${extensionFor(submission.lang)}`;
}

export function problemReadmePath(submission: CapturedSubmission): string {
  return `${problemDir(submission)}/README.md`;
}

export function notesPath(submission: CapturedSubmission): string {
  return `${problemDir(submission)}/NOTES.md`;
}

/**
 * Commit subject, e.g. `[Easy] 1. Two Sum`.
 *
 * Leads with difficulty so `git log --oneline` reads as a difficulty-tagged history,
 * which is the view people actually scan.
 */
export function commitSubject(submission: CapturedSubmission): string {
  const difficulty = submission.difficulty || 'Unrated';
  return `[${difficulty}] ${submission.questionFrontendId}. ${submission.title}`;
}

export function commitBody(submission: CapturedSubmission): string {
  const lines = [`https://leetcode.com/problems/${submission.titleSlug}/`, '', `Language: ${submission.lang}`];
  if (submission.runtimeDisplay) {
    lines.push(`Runtime: ${submission.runtimeDisplay}${percentile(submission.runtimePercentile)}`);
  }
  if (submission.memoryDisplay) {
    lines.push(`Memory: ${submission.memoryDisplay}${percentile(submission.memoryPercentile)}`);
  }
  return lines.join('\n');
}

export function percentile(value: number | undefined): string {
  return value === undefined ? '' : ` (beats ${value.toFixed(2)}%)`;
}

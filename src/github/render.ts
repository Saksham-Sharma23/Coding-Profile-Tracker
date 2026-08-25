import type { ManifestEntry, RepoManifest } from './manifest';
import { languageLabel, percentile, solutionPath } from './repo-layout';
import type { CapturedSubmission } from './types';

const PROJECT_URL = 'https://github.com/Saksham-Sharma23/Coding-Profile-Tracker';

/**
 * The per-problem README.
 *
 * Deliberately does not inline the solution source. The code already lives in
 * `solution.<ext>` next to this file, and duplicating it would mean every re-solve
 * produced a diff in two places that could drift apart — plus GitHub renders the real
 * file with working syntax highlighting and blame. The README links to it instead.
 */
export function renderProblemReadme(
  submission: CapturedSubmission,
  descriptionMarkdown: string | undefined,
): string {
  const url = `https://leetcode.com/problems/${submission.titleSlug}/`;
  const file = solutionPath(submission).split('/').pop() ?? 'solution';

  const facts = [
    `**Difficulty:** ${submission.difficulty || 'Unrated'}`,
    `**Language:** ${languageLabel(submission.lang)}`,
  ];
  if (submission.tags.length) facts.push(`**Topics:** ${submission.tags.join(', ')}`);
  facts.push(`**Solved:** ${isoDay(submission.solvedAt)}`);

  const sections = [
    `# ${submission.questionFrontendId}. ${submission.title}`,
    `[View on LeetCode](${url})`,
    facts.join('  \n'),
  ];

  const performance = renderPerformance(submission);
  if (performance) sections.push(performance);

  sections.push('## Problem');
  sections.push(
    descriptionMarkdown?.trim() ||
      // Says why it is missing rather than leaving a blank heading, so a statement that
      // failed to convert reads as a known gap instead of a broken commit.
      `_The problem statement could not be captured. [Read it on LeetCode](${url})._`,
  );

  sections.push('## Solution', `See [\`${file}\`](./${file}).`);

  return `${sections.join('\n\n')}\n`;
}

function renderPerformance(submission: CapturedSubmission): string {
  const parts: string[] = [];
  if (submission.runtimeDisplay) {
    parts.push(`Runtime ${submission.runtimeDisplay}${percentile(submission.runtimePercentile)}`);
  }
  if (submission.memoryDisplay) {
    parts.push(`Memory ${submission.memoryDisplay}${percentile(submission.memoryPercentile)}`);
  }
  return parts.length ? `> ${parts.join(' · ')}` : '';
}

/**
 * The repo's front page: a summary line and one row per problem.
 *
 * Regenerated in full on every push and committed in the same commit as the solution, so
 * the index can never drift out of step with what is actually in the tree.
 */
export function renderRootReadme(manifest: RepoManifest): string {
  const { problems } = manifest;

  const header = [
    '# Solutions',
    `Accepted solutions, committed automatically by [Coding Profile Tracker](${PROJECT_URL}).`,
  ];

  if (!problems.length) {
    return `${[...header, '_No solutions pushed yet._'].join('\n\n')}\n`;
  }

  const counts = countByDifficulty(problems);
  const breakdown = ['Easy', 'Medium', 'Hard']
    .filter((level) => counts[level])
    .map((level) => `${counts[level]} ${level}`)
    .join(' · ');

  const summary = `**${problems.length} solved**${breakdown ? ` — ${breakdown}` : ''}`;

  const rows = problems.map((entry) => {
    const cells = [
      entry.questionFrontendId,
      `[${escapeCell(entry.title)}](${encodePath(entry.dir)})`,
      entry.difficulty || '—',
      languageLabel(entry.lang),
      isoDay(entry.solvedAt),
    ];
    return `| ${cells.join(' | ')} |`;
  });

  const table = [
    '| # | Problem | Difficulty | Language | Solved |',
    '| ---: | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');

  return `${[...header, summary, table].join('\n\n')}\n`;
}

/**
 * Seeded once when a problem directory is first created, then never touched again.
 *
 * The push path checks for an existing NOTES.md and leaves it alone, so anything written
 * here survives every later re-solve. It is the one file in the repo that belongs to the
 * user rather than to the generator.
 */
export function renderNotesTemplate(submission: CapturedSubmission): string {
  return [
    `# Notes — ${submission.title}`,
    '_Your own notes. The extension creates this file once and never overwrites it._',
    '',
  ].join('\n\n');
}

function countByDifficulty(problems: ManifestEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of problems) {
    const level = entry.difficulty || 'Unrated';
    counts[level] = (counts[level] ?? 0) + 1;
  }
  return counts;
}

/** A `|` in a title would split the cell; nothing else in a title is table-significant. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/** Directory names come from slugs, but a link still has to survive an odd character. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function isoDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

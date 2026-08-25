import { describe, expect, it } from 'vitest';
import { emptyManifest, entryFor, upsertEntry } from './manifest';
import { renderNotesTemplate, renderProblemReadme, renderRootReadme } from './render';
import type { CapturedSubmission } from './types';

function submission(overrides: Partial<CapturedSubmission> = {}): CapturedSubmission {
  return {
    platform: 'leetcode',
    submissionId: '123',
    titleSlug: 'two-sum',
    questionFrontendId: '1',
    title: 'Two Sum',
    difficulty: 'Easy',
    tags: ['Array', 'Hash Table'],
    contentHtml: '',
    code: 'pass',
    lang: 'python3',
    solvedAt: Date.UTC(2026, 7, 25),
    runtimeDisplay: '52 ms',
    memoryDisplay: '16.9 MB',
    runtimePercentile: 90.1234,
    ...overrides,
  };
}

describe('renderProblemReadme', () => {
  it('leads with the numbered title', () => {
    expect(renderProblemReadme(submission(), 'Body.')).toMatch(/^# 1\. Two Sum\n/);
  });

  it('states the facts a reader wants first', () => {
    const out = renderProblemReadme(submission(), 'Body.');

    expect(out).toContain('**Difficulty:** Easy');
    expect(out).toContain('**Language:** Python 3');
    expect(out).toContain('**Topics:** Array, Hash Table');
    expect(out).toContain('**Solved:** 2026-08-25');
    expect(out).toContain('https://leetcode.com/problems/two-sum/');
  });

  it('includes the runtime and memory line', () => {
    expect(renderProblemReadme(submission(), 'Body.')).toContain(
      '> Runtime 52 ms (beats 90.12%) · Memory 16.9 MB',
    );
  });

  it('embeds the converted statement', () => {
    expect(renderProblemReadme(submission(), 'Given an array.')).toContain('Given an array.');
  });

  it('says why the statement is missing rather than leaving a blank heading', () => {
    const out = renderProblemReadme(submission(), undefined);
    expect(out).toContain('## Problem');
    expect(out).toContain('could not be captured');
  });

  it('links to the solution file instead of duplicating the code', () => {
    const out = renderProblemReadme(submission(), 'Body.');

    // Duplicating source into the README means two copies that can drift apart.
    expect(out).not.toContain('pass');
    expect(out).toContain('[`solution.py`](./solution.py)');
  });

  it('names the right file for another language', () => {
    expect(renderProblemReadme(submission({ lang: 'cpp' }), 'x')).toContain('solution.cpp');
  });

  it('omits the topics line when there are no tags', () => {
    expect(renderProblemReadme(submission({ tags: [] }), 'x')).not.toContain('**Topics:**');
  });

  it('ends with a newline', () => {
    expect(renderProblemReadme(submission(), 'x').endsWith('\n')).toBe(true);
  });
});

describe('renderRootReadme', () => {
  const withProblems = (count: number) => {
    let manifest = emptyManifest();
    for (let i = 1; i <= count; i++) {
      manifest = upsertEntry(
        manifest,
        entryFor(
          submission({
            questionFrontendId: String(i),
            titleSlug: `problem-${i}`,
            title: `Problem ${i}`,
            difficulty: i % 2 ? 'Easy' : 'Hard',
          }),
        ),
      );
    }
    return manifest;
  };

  it('says so plainly when nothing has been pushed', () => {
    const out = renderRootReadme(emptyManifest());
    expect(out).toContain('_No solutions pushed yet._');
    expect(out).not.toContain('| # |');
  });

  it('summarises the count and difficulty split', () => {
    expect(renderRootReadme(withProblems(3))).toContain('**3 solved** — 2 Easy · 1 Hard');
  });

  it('emits one table row per problem', () => {
    const out = renderRootReadme(withProblems(2));

    expect(out).toContain('| # | Problem | Difficulty | Language | Solved |');
    expect(out).toContain('[Problem 1](leetcode/0001-problem-1)');
    expect(out).toContain('[Problem 2](leetcode/0002-problem-2)');
  });

  it('escapes a pipe in a title so it cannot split the cell', () => {
    const manifest = upsertEntry(
      emptyManifest(),
      entryFor(submission({ title: 'A | B', titleSlug: 'a-b' })),
    );
    expect(renderRootReadme(manifest)).toContain('A \\| B');
  });

  it('shows a dash for a problem with no difficulty', () => {
    const manifest = upsertEntry(emptyManifest(), entryFor(submission({ difficulty: '' })));
    expect(renderRootReadme(manifest)).toContain('| — |');
  });
});

describe('renderNotesTemplate', () => {
  it('says the file belongs to the user', () => {
    const out = renderNotesTemplate(submission());
    expect(out).toContain('Two Sum');
    expect(out).toContain('never overwrites it');
  });
});

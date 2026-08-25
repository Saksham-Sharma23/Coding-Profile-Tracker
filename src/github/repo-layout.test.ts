import { describe, expect, it } from 'vitest';
import {
  commitSubject,
  extensionFor,
  languageLabel,
  notesPath,
  paddedId,
  percentile,
  problemDir,
  problemReadmePath,
  sanitizeSlug,
  solutionPath,
} from './repo-layout';
import type { CapturedSubmission } from './types';

function submission(overrides: Partial<CapturedSubmission> = {}): CapturedSubmission {
  return {
    platform: 'leetcode',
    submissionId: '123',
    titleSlug: 'two-sum',
    questionFrontendId: '1',
    title: 'Two Sum',
    difficulty: 'Easy',
    tags: ['Array'],
    contentHtml: '<p>x</p>',
    code: 'pass',
    lang: 'python3',
    solvedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('extensionFor', () => {
  it('maps LeetCode language slugs, which are not the obvious names', () => {
    // Getting any of these wrong silently produces a file GitHub will not highlight.
    expect(extensionFor('python3')).toBe('py');
    expect(extensionFor('golang')).toBe('go');
    expect(extensionFor('csharp')).toBe('cs');
    expect(extensionFor('cpp')).toBe('cpp');
    expect(extensionFor('bash')).toBe('sh');
  });

  it('collapses every SQL dialect onto .sql', () => {
    expect(extensionFor('mysql')).toBe('sql');
    expect(extensionFor('mssql')).toBe('sql');
    expect(extensionFor('oraclesql')).toBe('sql');
  });

  it('falls back to .txt for a language it has never seen', () => {
    // A new LeetCode language should cost the syntax highlighting, not the solution.
    expect(extensionFor('zig')).toBe('txt');
    expect(extensionFor('unknown')).toBe('txt');
  });

  it('is case-insensitive', () => {
    expect(extensionFor('Python3')).toBe('py');
  });
});

describe('languageLabel', () => {
  it('renders names a human wrote rather than API slugs', () => {
    expect(languageLabel('cpp')).toBe('C++');
    expect(languageLabel('python3')).toBe('Python 3');
    expect(languageLabel('csharp')).toBe('C#');
  });

  it('passes an unknown slug straight through', () => {
    expect(languageLabel('zig')).toBe('zig');
  });
});

describe('sanitizeSlug', () => {
  it('leaves an ordinary LeetCode slug untouched', () => {
    expect(sanitizeSlug('longest-substring-without-repeating-characters')).toBe(
      'longest-substring-without-repeating-characters',
    );
  });

  it('refuses to emit path traversal', () => {
    // The slug becomes a repo path segment, so `..` must never survive it.
    expect(sanitizeSlug('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeSlug('..')).toBe('untitled');
    expect(sanitizeSlug('/')).toBe('untitled');
  });

  it('collapses punctuation and trims the edges', () => {
    expect(sanitizeSlug('Two   Sum!!')).toBe('two-sum');
    expect(sanitizeSlug('--leading-and-trailing--')).toBe('leading-and-trailing');
  });

  it('never returns an empty segment', () => {
    expect(sanitizeSlug('')).toBe('untitled');
    expect(sanitizeSlug('!!!')).toBe('untitled');
  });
});

describe('paddedId', () => {
  it('zero-pads to four digits so directories sort numerically', () => {
    expect(paddedId('1')).toBe('0001');
    expect(paddedId('42')).toBe('0042');
    expect(paddedId('1234')).toBe('1234');
  });

  it('leaves ids longer than four digits alone rather than truncating', () => {
    expect(paddedId('12345')).toBe('12345');
  });

  it('sanitizes a non-numeric id instead of padding it', () => {
    expect(paddedId('LCP 01')).toBe('lcp-01');
  });
});

describe('paths', () => {
  it('builds a sortable, platform-scoped directory', () => {
    expect(problemDir(submission())).toBe('leetcode/0001-two-sum');
  });

  it('names the solution file from the language', () => {
    expect(solutionPath(submission())).toBe('leetcode/0001-two-sum/solution.py');
    expect(solutionPath(submission({ lang: 'cpp' }))).toBe('leetcode/0001-two-sum/solution.cpp');
  });

  it('keeps the README and notes beside the solution', () => {
    expect(problemReadmePath(submission())).toBe('leetcode/0001-two-sum/README.md');
    expect(notesPath(submission())).toBe('leetcode/0001-two-sum/NOTES.md');
  });

  it('puts the same problem in the same directory whatever the language', () => {
    // This is what makes a re-solve an update in place rather than a duplicate.
    expect(problemDir(submission({ lang: 'java' }))).toBe(problemDir(submission()));
  });
});

describe('commitSubject', () => {
  it('leads with difficulty so git log reads as a tagged history', () => {
    expect(commitSubject(submission())).toBe('[Easy] 1. Two Sum');
  });

  it('says Unrated rather than emitting empty brackets', () => {
    expect(commitSubject(submission({ difficulty: '' }))).toBe('[Unrated] 1. Two Sum');
  });
});

describe('percentile', () => {
  it('formats to two places', () => {
    expect(percentile(90.1234)).toBe(' (beats 90.12%)');
  });

  it('is empty when absent, so no stray parentheses appear', () => {
    expect(percentile(undefined)).toBe('');
  });
});

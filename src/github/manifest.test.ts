import { describe, expect, it } from 'vitest';
import {
  emptyManifest,
  entryFor,
  parseManifest,
  pushedFromManifest,
  renderManifest,
  upsertEntry,
  type ManifestEntry,
} from './manifest';
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
    contentHtml: '',
    code: 'x',
    lang: 'python3',
    solvedAt: 2_000,
    ...overrides,
  };
}

function entry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return { ...entryFor(submission()), ...overrides };
}

describe('parseManifest', () => {
  it('round-trips what renderManifest wrote', () => {
    const manifest = upsertEntry(emptyManifest(), entry());
    expect(parseManifest(renderManifest(manifest)).problems).toHaveLength(1);
  });

  it('returns an empty manifest for junk rather than throwing', () => {
    // A truncated or hand-edited file must not wedge the push path forever.
    expect(parseManifest('not json').problems).toEqual([]);
    expect(parseManifest('null').problems).toEqual([]);
    expect(parseManifest('[]').problems).toEqual([]);
  });

  it('drops entries that carry no slug or directory', () => {
    const raw = JSON.stringify({
      version: 1,
      problems: [{ titleSlug: 'ok', dir: 'leetcode/0001-ok' }, { title: 'nameless' }, null],
    });
    expect(parseManifest(raw).problems.map((each) => each.titleSlug)).toEqual(['ok']);
  });

  it('defaults a missing tags array so callers can read it unguarded', () => {
    const raw = JSON.stringify({ problems: [{ titleSlug: 'x', dir: 'd' }] });
    expect(parseManifest(raw).problems[0]!.tags).toEqual([]);
  });
});

describe('upsertEntry', () => {
  it('adds a new problem', () => {
    const manifest = upsertEntry(emptyManifest(), entry());
    expect(manifest.problems.map((each) => each.titleSlug)).toEqual(['two-sum']);
  });

  it('replaces rather than duplicates on a re-solve', () => {
    const first = upsertEntry(emptyManifest(), entry({ lang: 'python3' }));
    const second = upsertEntry(first, entry({ lang: 'cpp', submissionId: '456' }));

    expect(second.problems).toHaveLength(1);
    expect(second.problems[0]!.lang).toBe('cpp');
    expect(second.problems[0]!.submissionId).toBe('456');
  });

  it('keeps the earlier solve date when a problem is solved again', () => {
    // solvedAt records when the problem was first cracked; re-solving does not change it.
    const first = upsertEntry(emptyManifest(), entry({ solvedAt: 1_000 }));
    const second = upsertEntry(first, entry({ solvedAt: 9_000 }));
    expect(second.problems[0]!.solvedAt).toBe(1_000);
  });

  it('sorts numerically, so the file diffs by insertion not reordering', () => {
    let manifest = emptyManifest();
    for (const id of ['10', '2', '1']) {
      manifest = upsertEntry(manifest, entry({ questionFrontendId: id, titleSlug: `p${id}` }));
    }
    expect(manifest.problems.map((each) => each.questionFrontendId)).toEqual(['1', '2', '10']);
  });

  it('sorts non-numeric ids after the numbered ones', () => {
    let manifest = upsertEntry(emptyManifest(), entry({ questionFrontendId: 'LCP 01', titleSlug: 'a' }));
    manifest = upsertEntry(manifest, entry({ questionFrontendId: '5', titleSlug: 'b' }));
    expect(manifest.problems.map((each) => each.titleSlug)).toEqual(['b', 'a']);
  });
});

describe('pushedFromManifest', () => {
  it('rebuilds the local pushed map so a reinstall does not re-push everything', () => {
    const manifest = upsertEntry(emptyManifest(), entry());
    const pushed = pushedFromManifest(manifest);

    expect(pushed['two-sum']).toMatchObject({
      dir: 'leetcode/0001-two-sum',
      submissionId: '123',
    });
  });
});

describe('entryFor', () => {
  it('derives the directory from the submission', () => {
    expect(entryFor(submission()).dir).toBe('leetcode/0001-two-sum');
  });
});

import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_STATUS_CODE,
  buildCapturedSubmission,
  parseQuestionData,
  parseRecentAc,
  parseSubmissionDetails,
  type SubmissionDetails,
} from './leetcode-submission';

const ACCEPTED = {
  code: 'class Solution: pass',
  lang: { name: 'python3' },
  statusCode: ACCEPTED_STATUS_CODE,
  timestamp: 1_700_000_000,
  runtimeDisplay: '52 ms',
  memoryDisplay: '16.9 MB',
  runtimePercentile: 90.1234,
  memoryPercentile: 45,
  question: {
    questionId: '1',
    questionFrontendId: '1',
    title: 'Two Sum',
    titleSlug: 'two-sum',
  },
};

describe('parseRecentAc', () => {
  const entry = (id: string, slug: string, seconds: number) => ({
    id,
    title: slug,
    titleSlug: slug,
    timestamp: String(seconds),
  });

  it('returns ids newest first', () => {
    const out = parseRecentAc({
      data: {
        recentAcSubmissionList: [
          entry('200', 'add-two-numbers', 1_700_000_200),
          entry('100', 'two-sum', 1_700_000_100),
        ],
      },
    });
    expect(out.map((each) => each.id)).toEqual(['200', '100']);
    expect(out[0]!.solvedAt).toBe(1_700_000_200_000);
  });

  it('drops entries with no id, which cannot be looked up', () => {
    const out = parseRecentAc({
      data: {
        recentAcSubmissionList: [
          { title: 'Orphan', titleSlug: 'orphan', timestamp: '1700000000' },
          null,
          entry('1', 'ok', 1_700_000_000),
        ],
      },
    });
    expect(out.map((each) => each.id)).toEqual(['1']);
  });

  it('returns nothing for an absent or null list', () => {
    expect(parseRecentAc({})).toEqual([]);
    expect(parseRecentAc({ data: { recentAcSubmissionList: null } })).toEqual([]);
  });
});

describe('parseSubmissionDetails', () => {
  it('reads a full accepted submission', () => {
    const details = parseSubmissionDetails({ data: { submissionDetails: ACCEPTED } });

    expect(details).toMatchObject({
      code: 'class Solution: pass',
      lang: 'python3',
      titleSlug: 'two-sum',
      title: 'Two Sum',
      questionFrontendId: '1',
      runtimeDisplay: '52 ms',
      memoryPercentile: 45,
    });
    // Timestamps arrive as epoch seconds and must be converted.
    expect(details!.solvedAt).toBe(1_700_000_000_000);
  });

  it('rejects a submission that was not accepted', () => {
    // The whole point of the guard: never commit a wrong answer as a solution.
    const wrong = { ...ACCEPTED, statusCode: 11 };
    expect(parseSubmissionDetails({ data: { submissionDetails: wrong } })).toBeUndefined();
  });

  it('rejects a submission with no code', () => {
    const empty = { ...ACCEPTED, code: '' };
    expect(parseSubmissionDetails({ data: { submissionDetails: empty } })).toBeUndefined();
  });

  it('returns undefined when the submission belongs to someone else', () => {
    // The owner-only query answers null rather than erroring.
    expect(parseSubmissionDetails({ data: { submissionDetails: null } })).toBeUndefined();
    expect(parseSubmissionDetails({})).toBeUndefined();
  });

  it('falls back to questionId when the frontend id is absent', () => {
    const details = parseSubmissionDetails({
      data: {
        submissionDetails: {
          ...ACCEPTED,
          question: { questionId: '7', title: 'X', titleSlug: 'x' },
        },
      },
    });
    expect(details!.questionFrontendId).toBe('7');
  });

  it('keeps a submission whose language block is missing', () => {
    // Better a .txt file than losing source we already hold.
    const details = parseSubmissionDetails({
      data: { submissionDetails: { ...ACCEPTED, lang: null } },
    });
    expect(details!.lang).toBe('unknown');
  });

  it('omits optional performance fields rather than storing nulls', () => {
    const details = parseSubmissionDetails({
      data: {
        submissionDetails: {
          ...ACCEPTED,
          runtimeDisplay: null,
          memoryDisplay: null,
          runtimePercentile: null,
          memoryPercentile: null,
        },
      },
    });
    expect(details).not.toHaveProperty('runtimeDisplay');
    expect(details).not.toHaveProperty('runtimePercentile');
  });
});

describe('parseQuestionData', () => {
  it('reads the statement, difficulty and tags', () => {
    const question = parseQuestionData({
      data: {
        question: {
          questionFrontendId: '1',
          title: 'Two Sum',
          titleSlug: 'two-sum',
          content: '<p>Given an array</p>',
          difficulty: 'Easy',
          topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
        },
      },
    });

    expect(question).toMatchObject({
      difficulty: 'Easy',
      contentHtml: '<p>Given an array</p>',
      tags: ['Array', 'Hash Table'],
    });
  });

  it('tolerates a premium problem with no content', () => {
    const question = parseQuestionData({
      data: { question: { titleSlug: 'x', content: null, difficulty: null, topicTags: null } },
    });
    expect(question).toMatchObject({ contentHtml: '', difficulty: '', tags: [] });
  });

  it('returns undefined when the question is missing', () => {
    expect(parseQuestionData({ data: { question: null } })).toBeUndefined();
  });
});

describe('buildCapturedSubmission', () => {
  const details: SubmissionDetails = {
    code: 'x',
    lang: 'cpp',
    statusCode: ACCEPTED_STATUS_CODE,
    solvedAt: 1_700_000_000_000,
    titleSlug: 'two-sum',
    title: 'Two Sum',
    questionFrontendId: '1',
  };

  it('merges the submission with the question', () => {
    const captured = buildCapturedSubmission('99', details, {
      questionFrontendId: '1',
      title: 'Two Sum',
      titleSlug: 'two-sum',
      contentHtml: '<p>x</p>',
      difficulty: 'Easy',
      tags: ['Array'],
    });

    expect(captured).toMatchObject({
      platform: 'leetcode',
      submissionId: '99',
      code: 'x',
      lang: 'cpp',
      difficulty: 'Easy',
      tags: ['Array'],
      contentHtml: '<p>x</p>',
    });
  });

  it('still produces a pushable record when the question could not be fetched', () => {
    // A premium-gated or rate-limited statement must not cost us the code itself.
    const captured = buildCapturedSubmission('99', details);

    expect(captured.code).toBe('x');
    expect(captured.difficulty).toBe('');
    expect(captured.tags).toEqual([]);
    expect(captured.contentHtml).toBe('');
  });
});

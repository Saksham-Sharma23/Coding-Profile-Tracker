import type { CapturedSubmission } from '@/github/types';

/**
 * Queries for capturing one of the user's own accepted submissions.
 *
 * Kept apart from leetcode.ts, which is the profile adapter: that one runs in the
 * service worker against public data on a timer, while these run in a content script
 * against the logged-in session. Different context, different auth, different failure
 * modes — so they do not share a module even though they share an endpoint.
 *
 * Everything here is a pure parser over a decoded response, so it tests against captured
 * fixtures with no network and no DOM.
 */

export const GRAPHQL_ENDPOINT = 'https://leetcode.com/graphql/';

/** LeetCode's status code for Accepted. Every other value is a failed run. */
export const ACCEPTED_STATUS_CODE = 10;

/**
 * Owner-only. Returns null for a submission belonging to someone else, so this query
 * doubles as the check that we are capturing the signed-in user's own work.
 */
export const SUBMISSION_DETAILS_QUERY = `query submissionDetails($id: Int!) {
  submissionDetails(submissionId: $id) {
    code
    lang { name }
    statusCode
    timestamp
    runtimeDisplay
    memoryDisplay
    runtimePercentile
    memoryPercentile
    question {
      questionId
      questionFrontendId
      title
      titleSlug
    }
  }
}`;

/** Public. Carries the statement, the difficulty and the topic tags. */
export const QUESTION_DATA_QUERY = `query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    titleSlug
    content
    difficulty
    topicTags { name slug }
  }
}`;

/**
 * The same rolling 20-item window the profile adapter reads, but taken for its ids
 * rather than its titles — an id is what submissionDetails needs.
 */
export const RECENT_AC_QUERY = `query recentAc($u: String!, $limit: Int!) {
  recentAcSubmissionList(username: $u, limit: $limit) {
    id
    title
    titleSlug
    timestamp
  }
}`;

export const RECENT_AC_LIMIT = 20;

export interface RecentAcEntry {
  id: string;
  titleSlug: string;
  title: string;
  /** Epoch ms. */
  solvedAt: number;
}

export interface SubmissionDetails {
  code: string;
  lang: string;
  statusCode: number;
  /** Epoch ms. */
  solvedAt: number;
  titleSlug: string;
  title: string;
  questionFrontendId: string;
  runtimeDisplay?: string;
  memoryDisplay?: string;
  runtimePercentile?: number;
  memoryPercentile?: number;
}

export interface QuestionData {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  contentHtml: string;
  difficulty: string;
  tags: string[];
}

export interface RecentAcResponse {
  data?: {
    recentAcSubmissionList?:
      | ({ id?: string; title?: string; titleSlug?: string; timestamp?: string } | null)[]
      | null;
  };
}

export interface SubmissionDetailsResponse {
  data?: {
    submissionDetails?: {
      code?: string;
      lang?: { name?: string } | null;
      statusCode?: number;
      timestamp?: number | string;
      runtimeDisplay?: string | null;
      memoryDisplay?: string | null;
      runtimePercentile?: number | null;
      memoryPercentile?: number | null;
      question?: {
        questionId?: string;
        questionFrontendId?: string;
        title?: string;
        titleSlug?: string;
      } | null;
    } | null;
  };
}

export interface QuestionDataResponse {
  data?: {
    question?: {
      questionFrontendId?: string;
      title?: string;
      titleSlug?: string;
      content?: string | null;
      difficulty?: string | null;
      topicTags?: ({ name?: string; slug?: string } | null)[] | null;
    } | null;
  };
}

/**
 * Submission ids from the recent-accepted window, newest first.
 *
 * Entries missing an id or a slug are dropped rather than defaulted — an id we cannot
 * look up and a problem we cannot name are both unusable, and a placeholder would only
 * poison the seen-ids set.
 */
export function parseRecentAc(body: RecentAcResponse): RecentAcEntry[] {
  const recent = body.data?.recentAcSubmissionList;
  if (!Array.isArray(recent)) return [];

  const out: RecentAcEntry[] = [];
  for (const entry of recent) {
    if (!entry?.id || !entry.titleSlug || !entry.title) continue;

    const seconds = Number(entry.timestamp);
    if (!Number.isFinite(seconds)) continue;

    out.push({
      id: String(entry.id),
      titleSlug: entry.titleSlug,
      title: entry.title,
      solvedAt: seconds * 1000,
    });
  }

  return out.sort((a, b) => b.solvedAt - a.solvedAt);
}

/**
 * Returns undefined for anything that is not a complete, accepted submission of ours.
 *
 * The statusCode check is the important one: recentAcSubmissionList is supposed to
 * contain only accepted runs, but the guard costs nothing and is the difference between
 * committing working code and committing a wrong answer under a green heading.
 */
export function parseSubmissionDetails(
  body: SubmissionDetailsResponse,
): SubmissionDetails | undefined {
  const details = body.data?.submissionDetails;
  if (!details) return undefined;

  const { code, question } = details;
  if (!code || !question?.titleSlug || !question.title) return undefined;
  if (details.statusCode !== ACCEPTED_STATUS_CODE) return undefined;

  const seconds = Number(details.timestamp);

  return {
    code,
    // Some older submissions carry no language block; 'unknown' maps to a .txt file
    // rather than dropping a solution we already have the source for.
    lang: details.lang?.name ?? 'unknown',
    statusCode: details.statusCode,
    solvedAt: Number.isFinite(seconds) ? seconds * 1000 : Date.now(),
    titleSlug: question.titleSlug,
    title: question.title,
    questionFrontendId: question.questionFrontendId ?? question.questionId ?? '0',
    ...(details.runtimeDisplay && { runtimeDisplay: details.runtimeDisplay }),
    ...(details.memoryDisplay && { memoryDisplay: details.memoryDisplay }),
    ...(typeof details.runtimePercentile === 'number' && {
      runtimePercentile: details.runtimePercentile,
    }),
    ...(typeof details.memoryPercentile === 'number' && {
      memoryPercentile: details.memoryPercentile,
    }),
  };
}

export function parseQuestionData(body: QuestionDataResponse): QuestionData | undefined {
  const question = body.data?.question;
  if (!question?.titleSlug) return undefined;

  return {
    questionFrontendId: question.questionFrontendId ?? '0',
    title: question.title ?? question.titleSlug,
    titleSlug: question.titleSlug,
    contentHtml: question.content ?? '',
    difficulty: question.difficulty ?? '',
    tags: (question.topicTags ?? [])
      .map((tag) => tag?.name)
      .filter((name): name is string => Boolean(name)),
  };
}

/**
 * Merges the two queries into the unit the push path consumes.
 *
 * The submission is authoritative for everything it knows — it is the record of what was
 * actually run — and the question fills in only the statement, difficulty and tags,
 * which submissionDetails does not carry. `question` is optional because the public
 * query can fail (a premium problem, a rate limit) without invalidating a submission we
 * already hold the code for.
 */
export function buildCapturedSubmission(
  submissionId: string,
  details: SubmissionDetails,
  question?: QuestionData,
): CapturedSubmission {
  return {
    platform: 'leetcode',
    submissionId,
    titleSlug: details.titleSlug,
    questionFrontendId: details.questionFrontendId || question?.questionFrontendId || '0',
    title: details.title || question?.title || details.titleSlug,
    difficulty: question?.difficulty ?? '',
    tags: question?.tags ?? [],
    contentHtml: question?.contentHtml ?? '',
    code: details.code,
    lang: details.lang,
    solvedAt: details.solvedAt,
    ...(details.runtimeDisplay && { runtimeDisplay: details.runtimeDisplay }),
    ...(details.memoryDisplay && { memoryDisplay: details.memoryDisplay }),
    ...(details.runtimePercentile !== undefined && {
      runtimePercentile: details.runtimePercentile,
    }),
    ...(details.memoryPercentile !== undefined && { memoryPercentile: details.memoryPercentile }),
  };
}

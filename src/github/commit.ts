import { htmlToMarkdownOffscreen } from '@/offscreen/client';
import {
  createBlob,
  createCommit,
  createTree,
  getFile,
  getHead,
  GithubConflictError,
  putFile,
  updateRef,
  type HeadRef,
  type TreeEntry,
} from './api';
import {
  emptyManifest,
  entryFor,
  parseManifest,
  renderManifest,
  upsertEntry,
  type RepoManifest,
} from './manifest';
import {
  commitBody,
  commitSubject,
  extensionFor,
  MANIFEST_PATH,
  notesPath,
  problemDir,
  problemReadmePath,
  ROOT_README,
  solutionPath,
} from './repo-layout';
import { renderNotesTemplate, renderProblemReadme, renderRootReadme } from './render';
import type { CapturedSubmission, GithubRepoRef, PushedRecord } from './types';

/**
 * What we know about the repo after a successful push, carried into the next one.
 *
 * Exists because GitHub's ref and contents reads are eventually consistent: immediately
 * after updateRef succeeds, reading the ref back can still return the *previous* sha.
 * The next push then builds on a stale parent and is rejected as "not a fast forward" —
 * which is precisely the alternating pushed/failed pattern a backlog produced.
 *
 * Re-reading is the bug. After a successful push we already know the new head and the
 * exact manifest we just committed, so a serial drain threads them forward instead of
 * asking GitHub to confirm something it may not have replicated yet.
 *
 * The manifest half matters just as much: a stale manifest read would rebuild the index
 * without the entries just added, silently dropping them from README.md on the next
 * commit.
 */
export interface PushChain {
  head: HeadRef;
  manifest: RepoManifest;
}

export interface PushResult {
  /** 'updated' when the problem already existed in the repo — a re-solve. */
  status: 'pushed' | 'updated';
  record: PushedRecord;
  commitUrl: string;
  /** Pass to the next push in the same drain. Discard it if anything failed. */
  chain: PushChain;
}

/** A conflict usually means replication lag, so rebuild on a fresh read and try again. */
const CONFLICT_RETRIES = 2;

/**
 * Commits one solved problem as a single commit.
 *
 * The Git Data API rather than the Contents API, because a problem is three or four
 * files and `PUT /contents` would make that three or four separate commits. Blobs, then
 * one tree on top of the current head, then one commit, then the ref moves — so the
 * history reads as one entry per problem solved, which is the whole point of the repo.
 *
 * A conflict is retried here rather than thrown back to the queue. It is nearly always
 * this repo's own previous push not yet visible, which clears in a second or two —
 * bouncing it back would spend one of the item's six attempts on a non-problem.
 */
export async function pushSubmission(
  token: string,
  repo: GithubRepoRef,
  submission: CapturedSubmission,
  chain?: PushChain,
): Promise<PushResult> {
  let known = chain;

  for (let attempt = 0; ; attempt++) {
    try {
      return await commitOnce(token, repo, submission, known);
    } catch (err) {
      if (!(err instanceof GithubConflictError) || attempt >= CONFLICT_RETRIES) throw err;
      // Whatever we believed about the repo was wrong. Drop it and read fresh, after a
      // pause long enough for GitHub to have caught up with itself.
      known = undefined;
      await sleep(1_500 * (attempt + 1));
    }
  }
}

async function commitOnce(
  token: string,
  repo: GithubRepoRef,
  submission: CapturedSubmission,
  chain: PushChain | undefined,
): Promise<PushResult> {
  const head = chain?.head ?? (await ensureBranch(token, repo));
  const manifest = chain?.manifest ?? (await readManifest(token, repo));
  const existing = manifest.problems.find((each) => each.titleSlug === submission.titleSlug);

  const dir = problemDir(submission);
  // Converted before any write, so a statement that fails to convert degrades to a
  // link in the README rather than aborting a commit that already has the code.
  const description = await htmlToMarkdownOffscreen(submission.contentHtml);

  const files: { path: string; content: string }[] = [
    { path: solutionPath(submission), content: withTrailingNewline(submission.code) },
    { path: problemReadmePath(submission), content: renderProblemReadme(submission, description) },
  ];

  // Seeded once, on first sight of the problem. On a re-solve the file is left entirely
  // alone — it is the one file in the repo the user owns, and silently reverting
  // someone's notes to a template would be unforgivable.
  if (!existing) {
    files.push({ path: notesPath(submission), content: renderNotesTemplate(submission) });
  }

  const nextManifest = upsertEntry(manifest, entryFor(submission));
  files.push({ path: MANIFEST_PATH, content: renderManifest(nextManifest) });
  files.push({ path: ROOT_README, content: renderRootReadme(nextManifest) });

  const entries: TreeEntry[] = [];
  for (const file of files) {
    entries.push({ path: file.path, sha: await createBlob(token, repo, file.content) });
  }

  // A re-solve in another language leaves the previous solution file orphaned beside the
  // new one, which reads as two competing answers. Drop it in the same commit.
  const stale = staleSolutionPath(existing?.lang, submission);
  if (stale) entries.push({ path: stale, sha: null });

  const treeSha = await createTree(token, repo, head.treeSha, entries);
  const message = `${commitSubject(submission)}\n\n${commitBody(submission)}`;
  const commit = await createCommit(token, repo, message, treeSha, head.commitSha);
  await updateRef(token, repo, commit.sha);

  return {
    status: existing ? 'updated' : 'pushed',
    record: {
      dir,
      submissionId: submission.submissionId,
      pushedAt: Date.now(),
      commitSha: commit.sha,
    },
    // The ref now points at this commit and the manifest is exactly what we wrote, so
    // the next push in this drain can build straight on top without asking GitHub.
    chain: { head: { commitSha: commit.sha, treeSha }, manifest: nextManifest },
    commitUrl: commit.htmlUrl,
  };
}

/**
 * The branch tip, creating the first commit if the repo is empty.
 *
 * An empty repo has no ref for a tree to build on. Rather than refusing it — which would
 * reject the most natural choice, a repo made moments ago for exactly this — the root
 * README is written through the Contents API, which creates the branch as a side effect.
 */
async function ensureBranch(
  token: string,
  repo: GithubRepoRef,
): Promise<{ commitSha: string; treeSha: string }> {
  const head = await getHead(token, repo);
  if (head) return head;

  await putFile(
    token,
    repo,
    ROOT_README,
    renderRootReadme(emptyManifest()),
    'Initialise solutions repository',
  );

  const created = await getHead(token, repo);
  if (!created) {
    throw new Error(`Could not create the ${repo.branch} branch in ${repo.owner}/${repo.name}`);
  }
  return created;
}

/**
 * Reads the repo's own index.
 *
 * Read fresh on every push rather than mirrored locally, so two machines pushing to one
 * repo stay consistent and a reinstall picks up where it left off. It costs one GET per
 * push, which is nothing against the five calls the commit itself takes.
 */
export async function readManifest(token: string, repo: GithubRepoRef): Promise<RepoManifest> {
  const raw = await getFile(token, repo, MANIFEST_PATH);
  return raw === undefined ? emptyManifest() : parseManifest(raw);
}

/** The previous solution file's path, when a re-solve changed the language. */
function staleSolutionPath(
  previousLang: string | undefined,
  submission: CapturedSubmission,
): string | undefined {
  if (!previousLang) return undefined;

  const before = extensionFor(previousLang);
  const after = extensionFor(submission.lang);
  return before === after ? undefined : `${problemDir(submission)}/solution.${before}`;
}

/** Git is happier with a trailing newline, and LeetCode's editor does not add one. */
function withTrailingNewline(code: string): string {
  return code.endsWith('\n') ? code : `${code}\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

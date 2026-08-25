import { beforeEach, describe, expect, it } from 'vitest';
import { readState, saveSettings } from '@/storage/repo';
import { mockChromeStorage } from '@/test/chrome-storage';
import {
  appendLog,
  clearConnection,
  defaultGithubState,
  hasAccount,
  isConnected,
  isPushEnabled,
  normalize,
  readGithubState,
  rememberSeen,
  updateGithubState,
} from './storage';
import type { GithubState } from './types';

beforeEach(() => {
  mockChromeStorage();
});

const connected = (): Partial<GithubState> => ({
  token: 'ghp_secret',
  tokenKind: 'pat',
  user: { login: 'octocat' },
  repo: { owner: 'octocat', name: 'solutions', branch: 'main' },
  enabled: true,
});

describe('token isolation', () => {
  /*
   * The reason the GitHub state has its own storage key at all.
   *
   * The settings page exports the entire tracker blob to a plaintext download that people
   * put in cloud folders and attach to issues. A token stored inside TrackerState would
   * ride along in every one of those. This test is the enforcement.
   */
  it('keeps the token out of the tracker blob that gets exported', async () => {
    await updateGithubState((state) => Object.assign(state, connected()));
    await saveSettings({ handles: { leetcode: 'octocat' } });

    const exported = JSON.stringify(await readState());

    expect(exported).not.toContain('ghp_secret');
    expect(exported).not.toContain('token');
  });

  it('survives an import that replaces the whole tracker blob', async () => {
    await updateGithubState((state) => Object.assign(state, connected()));

    // What DataSection.importJson does: replace TrackerState wholesale.
    await chrome.storage.local.set({ tracker: { version: 6, settings: {} } });

    expect((await readGithubState()).token).toBe('ghp_secret');
  });
});

describe('normalize', () => {
  it('returns a usable default for junk', () => {
    expect(normalize(undefined)).toEqual(defaultGithubState());
    expect(normalize('nonsense')).toEqual(defaultGithubState());
    expect(normalize(42)).toEqual(defaultGithubState());
  });

  it('never enables pushing from a malformed blob', () => {
    // enabled must be an explicit true; anything else means off.
    expect(normalize({ enabled: 'yes' }).enabled).toBe(false);
    expect(normalize({}).enabled).toBe(false);
  });

  it('defaults a repo with no branch to main', () => {
    const state = normalize({ repo: { owner: 'a', name: 'b' } });
    expect(state.repo?.branch).toBe('main');
  });

  it('drops a repo that names no owner', () => {
    expect(normalize({ repo: { name: 'b' } }).repo).toBeUndefined();
  });

  it('discards non-string seen ids', () => {
    const state = normalize({ seenSubmissionIds: ['1', 2, null, '3'] });
    expect(state.seenSubmissionIds).toEqual(['1', '3']);
  });

  it('rejects an unrecognised token kind', () => {
    expect(normalize({ tokenKind: 'magic' }).tokenKind).toBeUndefined();
  });
});

describe('hasAccount', () => {
  /*
   * Guards a deadlock that shipped once.
   *
   * The settings UI branches on this to decide whether to show the repository picker.
   * Branching on isConnected() instead — which also demands a repo — means a freshly
   * authorised account is told it is not connected, while the only control that could
   * set a repo stays hidden behind the check it would satisfy. Authorising succeeds and
   * the UI never moves.
   */
  it('is true on a token alone, before any repository is chosen', () => {
    const state = normalize({ token: 'ghp_secret', user: { login: 'octocat' } });

    expect(hasAccount(state)).toBe(true);
    expect(isConnected(state)).toBe(false);
  });

  it('is false with no token', () => {
    expect(hasAccount(normalize({}))).toBe(false);
    expect(hasAccount(normalize({ repo: { owner: 'a', name: 'b' } }))).toBe(false);
  });
});

describe('isConnected / isPushEnabled', () => {
  it('needs both a token and a repo to count as connected', () => {
    expect(isConnected(normalize({ token: 't' }))).toBe(false);
    expect(isConnected(normalize({ repo: { owner: 'a', name: 'b' } }))).toBe(false);
    expect(isConnected(normalize(connected()))).toBe(true);
  });

  it('treats a fresh connection as inert until pushing is switched on', () => {
    // Connecting an account and agreeing to publish code are separate decisions.
    const state = normalize({ ...connected(), enabled: false });
    expect(isConnected(state)).toBe(true);
    expect(isPushEnabled(state)).toBe(false);
  });
});

describe('rememberSeen', () => {
  it('keeps newest first and de-duplicates', () => {
    const state = defaultGithubState();
    rememberSeen(state, ['1', '2']);
    rememberSeen(state, ['3', '1']);
    expect(state.seenSubmissionIds).toEqual(['3', '1', '2']);
  });

  it('bounds the list so a heavy user does not grow it forever', () => {
    const state = defaultGithubState();
    rememberSeen(state, Array.from({ length: 900 }, (_, i) => String(i)));
    expect(state.seenSubmissionIds).toHaveLength(500);
    // The most recent must be the ones kept.
    expect(state.seenSubmissionIds[0]).toBe('0');
  });
});

describe('appendLog', () => {
  it('prepends and bounds the log', () => {
    const state = defaultGithubState();
    for (let i = 0; i < 150; i++) {
      appendLog(state, { at: i, titleSlug: `p${i}`, title: `P${i}`, status: 'pushed' });
    }
    expect(state.log).toHaveLength(100);
    expect(state.log[0]!.titleSlug).toBe('p149');
  });
});

describe('clearConnection', () => {
  it('forgets the account and stops pushing', () => {
    const state = normalize(connected());
    clearConnection(state);

    expect(state.token).toBeUndefined();
    expect(state.user).toBeUndefined();
    expect(state.repo).toBeUndefined();
    expect(state.enabled).toBe(false);
  });

  it('clears pushed, because that map described one specific repo', () => {
    // Keeping it would make a later connection to a different repo skip every problem.
    const state = normalize({ ...connected(), pushed: { 'two-sum': { dir: 'd', submissionId: '1', pushedAt: 1 } } });
    clearConnection(state);
    expect(state.pushed).toEqual({});
  });

  it('keeps the push log, which is the user record of what was sent where', () => {
    const state = normalize(connected());
    appendLog(state, { at: 1, titleSlug: 'two-sum', title: 'Two Sum', status: 'pushed' });
    clearConnection(state);
    expect(state.log).toHaveLength(1);
  });
});

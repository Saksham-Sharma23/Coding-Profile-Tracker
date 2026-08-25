import { useState } from 'react';
import {
  DEVICE_FLOW_PORT,
  sendMessage,
  type DeviceFlowEvent,
  type Response,
} from '@/background/messages';
import type { RepoSummary } from '@/github/api';
import {
  GITHUB_ORIGINS,
  isDeviceFlowConfigured,
  SCOPE_PRIVATE,
  SCOPE_PUBLIC,
} from '@/github/config';
import { isConnected } from '@/github/storage';
import { useGithub } from '../../useGithub';
import { timeAgo } from '../../useTracker';
import type { SectionProps } from './types';

/**
 * Connect a GitHub account and push accepted solutions to a repository.
 *
 * The one place in the extension where data leaves the machine, so it is deliberately
 * explicit at every step: permissions are requested here on a click, connecting does not
 * by itself start pushing, and the log below shows exactly what was sent and when.
 */
/**
 * What the chosen repo already contains, read from its own committed index.
 *
 * Worth saying out loud: it tells someone reconnecting on a new machine that their
 * history was found, rather than leaving them wondering whether it is about to re-push
 * everything.
 */
function describeExisting(count: number): string {
  if (!count) return 'Nothing pushed to this repository yet.';
  return `${count} solution${count === 1 ? '' : 's'} already in this repository.`;
}

export function GithubSection({ flash }: SectionProps) {
  const { github, loading } = useGithub();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [deviceCode, setDeviceCode] = useState<{ code: string; url: string } | undefined>();
  const [repos, setRepos] = useState<RepoSummary[] | undefined>();
  const [newRepoName, setNewRepoName] = useState('leetcode-solutions');
  const [wantPrivate, setWantPrivate] = useState(false);

  if (loading) return null;

  const connected = isConnected(github);
  const pending = github.queue.length;

  /**
   * Host permissions are granted here rather than at install, and chrome.permissions
   * .request() only works from a user gesture on an extension page — which is why this
   * lives in the component and not in the service worker.
   */
  const grantPermissions = async (): Promise<boolean> => {
    try {
      const granted = await chrome.permissions.request({ origins: GITHUB_ORIGINS });
      if (!granted) setError('GitHub access was declined, so nothing can be pushed.');
      return granted;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const run = async (action: () => Promise<Response>, ok: string): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (result.type === 'github-result' && !result.ok) {
        setError(result.error ?? 'That did not work.');
        return false;
      }
      if (result.type === 'error') {
        setError(result.error);
        return false;
      }
      if (ok) flash(ok);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Device Flow over a port.
   *
   * The port keeps the service worker alive for the minutes GitHub may take to see an
   * approval; closing this page disconnects it and the worker abandons the poll.
   */
  const connectWithDevice = async (scope: string) => {
    if (!(await grantPermissions())) return;

    setBusy(true);
    setError('');
    setDeviceCode(undefined);

    const port = chrome.runtime.connect({ name: DEVICE_FLOW_PORT });
    port.onMessage.addListener((event: DeviceFlowEvent) => {
      if (event.type === 'code') {
        setDeviceCode({ code: event.userCode, url: event.verificationUri });
        void chrome.tabs.create({ url: event.verificationUri });
      }
      if (event.type === 'connected') {
        setDeviceCode(undefined);
        setBusy(false);
        port.disconnect();
        flash(`Connected as ${event.login}`);
      }
      if (event.type === 'failed') {
        setDeviceCode(undefined);
        setBusy(false);
        setError(event.error);
        port.disconnect();
      }
    });
    port.postMessage({ type: 'start', scope });
  };

  const connectWithPat = async () => {
    if (!token.trim()) return;
    if (!(await grantPermissions())) return;

    const ok = await run(
      () => sendMessage({ type: 'github-connect-pat', token: token.trim() }),
      'Connected',
    );
    if (ok) setToken('');
  };

  const loadRepos = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await sendMessage({ type: 'github-list-repos' });
      if (result.type === 'github-repos') setRepos(result.repos);
      else if (result.type === 'github-result') setError(result.error ?? 'Could not list repos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>GitHub sync</h2>

      {!connected ? (
        <section className="settings-row github-connect">
          <p className="muted hint">
            Push every accepted LeetCode solution — the problem, its description and the code
            you submitted — to a repository you choose. Nothing is sent until you connect an
            account and switch pushing on.
          </p>

          {isDeviceFlowConfigured() ? (
            <div className="github-buttons">
              <button disabled={busy} onClick={() => void connectWithDevice(SCOPE_PUBLIC)}>
                Connect with GitHub
              </button>
              <button
                className="github-alt"
                disabled={busy}
                onClick={() => void connectWithDevice(SCOPE_PRIVATE)}
              >
                Connect (allow private repos)
              </button>
            </div>
          ) : (
            <p className="muted hint">
              This build has no GitHub OAuth client configured, so connect with a token below.
              A fine-grained token is the narrower option anyway — it can be limited to the one
              repository.
            </p>
          )}

          {deviceCode && (
            <p className="ok-text" role="status">
              Enter code <strong>{deviceCode.code}</strong> at{' '}
              <a href={deviceCode.url} target="_blank" rel="noreferrer">
                {deviceCode.url}
              </a>
              . Waiting for approval…
            </p>
          )}

          <label className="github-token">
            <span className="muted">Or paste a personal access token</span>
            <input
              type="password"
              value={token}
              placeholder="github_pat_… or ghp_…"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button disabled={busy || !token.trim()} onClick={() => void connectWithPat()}>
            Connect with token
          </button>
          <span className="muted hint">
            Needs <strong>Contents: Read and write</strong> on the repository you pick.
          </span>
        </section>
      ) : (
        <>
          <section className="settings-row">
            <span>
              Connected as <strong>{github.user?.login}</strong>
              {github.tokenKind === 'pat' && <span className="muted"> (token)</span>}
            </span>
            <button
              className="danger"
              disabled={busy}
              onClick={() => void run(() => sendMessage({ type: 'github-disconnect' }), 'Disconnected')}
            >
              Disconnect
            </button>
          </section>

          <section className="settings-row">
            <span>
              Repository:{' '}
              {github.repo ? (
                <a
                  href={`https://github.com/${github.repo.owner}/${github.repo.name}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>
                    {github.repo.owner}/{github.repo.name}
                  </strong>
                </a>
              ) : (
                <span className="muted">not chosen yet</span>
              )}
            </span>
            <button disabled={busy} onClick={() => void loadRepos()}>
              {repos ? 'Reload list' : 'Choose repository'}
            </button>
          </section>

          {repos && (
            <section className="settings-row github-repos">
              <select
                aria-label="Repository"
                defaultValue=""
                disabled={busy}
                onChange={(e) => {
                  const chosen = repos.find((repo) => repo.fullName === e.target.value);
                  if (!chosen) return;
                  void run(
                    () =>
                      sendMessage({
                        type: 'github-set-repo',
                        owner: chosen.owner,
                        name: chosen.name,
                        branch: chosen.defaultBranch,
                      }),
                    `Pushing to ${chosen.fullName}`,
                  );
                }}
              >
                <option value="" disabled>
                  Pick one of your repositories…
                </option>
                {repos.map((repo) => (
                  <option key={repo.fullName} value={repo.fullName}>
                    {repo.fullName}
                    {repo.private ? ' (private)' : ''}
                  </option>
                ))}
              </select>

              <span className="muted hint">or create a new one:</span>
              <input
                value={newRepoName}
                aria-label="New repository name"
                onChange={(e) => setNewRepoName(e.target.value)}
              />
              <label className="switch-inline">
                <input
                  type="checkbox"
                  checked={wantPrivate}
                  onChange={(e) => setWantPrivate(e.target.checked)}
                />
                Private
              </label>
              <button
                disabled={busy || !newRepoName.trim()}
                onClick={() =>
                  void run(
                    () =>
                      sendMessage({
                        type: 'github-create-repo',
                        name: newRepoName.trim(),
                        private: wantPrivate,
                      }),
                    `Created ${newRepoName.trim()}`,
                  )
                }
              >
                Create
              </button>
            </section>
          )}

          <section className="settings-row">
            <label className="switch-inline">
              <input
                type="checkbox"
                checked={github.enabled}
                disabled={busy || !github.repo}
                onChange={(e) =>
                  void run(
                    () => sendMessage({ type: 'github-set-enabled', enabled: e.target.checked }),
                    e.target.checked ? 'Auto-push on' : 'Auto-push off',
                  )
                }
              />
              Push accepted solutions automatically
            </label>
            <span className="muted hint">
              {github.repo
                ? `Captured from leetcode.com while you are signed in there. ${describeExisting(
                    Object.keys(github.pushed).length,
                  )}`
                : 'Choose a repository first.'}
            </span>
          </section>

          {pending > 0 && (
            <section className="settings-row">
              <span>
                {pending} waiting to push
                {github.queue[0]?.lastError && (
                  <span className="muted"> — {github.queue[0].lastError}</span>
                )}
              </span>
              <button
                disabled={busy}
                onClick={() => void run(() => sendMessage({ type: 'github-retry-queue' }), 'Retrying')}
              >
                Try now
              </button>
            </section>
          )}
        </>
      )}

      {error && (
        <p className="bad-text options-note" role="alert">
          {error}
        </p>
      )}

      {github.log.length > 0 && (
        <section className="github-log">
          <ul>
            {github.log.slice(0, 10).map((entry) => (
              <li key={`${entry.at}-${entry.titleSlug}`} className={entry.status}>
                <span className="github-log-title">
                  {entry.commitUrl ? (
                    <a href={entry.commitUrl} target="_blank" rel="noreferrer">
                      {entry.title}
                    </a>
                  ) : (
                    entry.title
                  )}
                </span>
                <span className="muted">
                  {entry.status === 'failed' ? (entry.detail ?? 'failed') : entry.status}
                </span>
                <span className="muted">{timeAgo(entry.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

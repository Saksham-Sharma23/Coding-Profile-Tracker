import { githubFetch, GithubAuthError } from './api';
import { GITHUB_CLIENT_ID } from './config';
import type { GithubUser } from './types';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** Scopes that permit writing to a repository's contents. */
const WRITE_SCOPES = ['repo', 'public_repo'];

export interface DeviceGrant {
  deviceCode: string;
  /** The 8-character code the user types into github.com/login/device. */
  userCode: string;
  verificationUri: string;
  /** Epoch ms after which the grant is dead and a new one must be started. */
  expiresAt: number;
  /** Seconds GitHub asks us to wait between polls. Raising it is mandatory, not advisory. */
  intervalSeconds: number;
}

export interface TokenInfo {
  user: GithubUser;
  /**
   * Granted scopes, or undefined for a fine-grained PAT — those carry per-resource
   * permissions instead and send no scope header at all.
   */
  scope?: string;
}

/**
 * Step one of the Device Flow: ask GitHub for a code to show the user.
 *
 * Runs in the service worker because github.com is covered by an optional host
 * permission there; the same call from an extension page would be blocked by CORS.
 */
export async function startDeviceFlow(scope: string): Promise<DeviceGrant> {
  const body = await postForm(DEVICE_CODE_URL, {
    client_id: GITHUB_CLIENT_ID,
    scope,
  });

  if (body.error) throw new Error(describeDeviceError(body.error, body.error_description));
  if (!body.device_code || !body.user_code) {
    throw new Error('GitHub did not return a device code');
  }

  const expiresIn = Number(body.expires_in) || 900;
  const interval = Number(body.interval) || 5;

  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri ?? 'https://github.com/login/device',
    expiresAt: Date.now() + expiresIn * 1000,
    intervalSeconds: interval,
  };
}

export interface DeviceTokenResult {
  token: string;
  scope: string;
}

/**
 * Step two: poll until the user approves, declines, or the grant expires.
 *
 * The interval is owned by GitHub, not by us — `slow_down` means back off permanently
 * for this grant, and ignoring it earns a hard rate limit. `signal` aborts the wait so
 * closing the settings page ends the flow immediately instead of leaving a loop running
 * in a worker nobody is watching.
 */
export async function pollForToken(
  grant: DeviceGrant,
  signal: AbortSignal,
): Promise<DeviceTokenResult> {
  let intervalMs = grant.intervalSeconds * 1000;

  while (!signal.aborted) {
    if (Date.now() > grant.expiresAt) {
      throw new Error('The code expired before it was approved. Start again to get a new one.');
    }

    await delay(intervalMs, signal);
    if (signal.aborted) break;

    const body = await postForm(ACCESS_TOKEN_URL, {
      client_id: GITHUB_CLIENT_ID,
      device_code: grant.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    if (body.access_token) {
      return { token: body.access_token, scope: body.scope ?? '' };
    }

    switch (body.error) {
      case 'authorization_pending':
        // The expected answer until the user finishes on github.com.
        continue;
      case 'slow_down':
        // GitHub adds 5s to the required interval whenever it sends this.
        intervalMs = (Number(body.interval) || grant.intervalSeconds + 5) * 1000;
        continue;
      case 'expired_token':
        throw new Error('The code expired before it was approved. Start again to get a new one.');
      case 'access_denied':
        throw new Error('Authorisation was declined on GitHub.');
      default:
        throw new Error(describeDeviceError(body.error, body.error_description));
    }
  }

  throw new Error('Connection cancelled');
}

/**
 * Confirms a token works and reports who it belongs to.
 *
 * Also the validation path for a pasted PAT, which is why it reads the scope header
 * rather than trusting what the user believes they created.
 */
export async function inspectToken(token: string): Promise<TokenInfo> {
  const res = await githubFetch(token, '/user');
  const body = (await res.json()) as { login?: string; avatar_url?: string };

  if (!body.login) throw new GithubAuthError('GitHub did not identify this token');

  const scope = res.headers.get('x-oauth-scopes') ?? undefined;
  return {
    user: { login: body.login, ...(body.avatar_url && { avatarUrl: body.avatar_url }) },
    ...(scope !== undefined && { scope }),
  };
}

/**
 * Whether a classic token's scopes allow writing repository contents.
 *
 * Returns true when `scope` is undefined: that means a fine-grained PAT, whose
 * permissions are per-repository and invisible here. Guessing "no" would reject the
 * better-scoped option of the two, so the real check is deferred to the first write,
 * where a 403 reports it accurately.
 */
export function canWriteRepos(scope: string | undefined): boolean {
  if (scope === undefined) return true;
  const granted = scope.split(',').map((each) => each.trim());
  return WRITE_SCOPES.some((needed) => granted.includes(needed));
}

interface DeviceResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number | string;
  interval?: number | string;
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * The device endpoints live on github.com and speak form encoding, not JSON — unlike
 * every other call in this integration, which is why they do not go through githubFetch.
 */
async function postForm(url: string, fields: Record<string, string>): Promise<DeviceResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      // Without this GitHub replies with a urlencoded body, errors included.
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields).toString(),
  });

  if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status} starting the device flow`);
  return (await res.json()) as DeviceResponse;
}

function describeDeviceError(error: string | undefined, description?: string): string {
  if (error === 'device_flow_disabled') {
    return 'This OAuth app does not have Device Flow enabled. Enable it in the app settings on GitHub, or connect with a personal access token instead.';
  }
  if (error === 'unauthorized_client' || error === 'invalid_client') {
    return 'The configured GitHub client ID was rejected. Connect with a personal access token instead.';
  }
  return description ?? error ?? 'GitHub rejected the request';
}

/** Sleep that wakes early when the flow is cancelled. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });

    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
  });
}

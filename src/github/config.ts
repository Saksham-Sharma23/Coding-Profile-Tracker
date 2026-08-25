/**
 * OAuth App client id used for the GitHub Device Flow.
 *
 * Public by design. The Device Flow is the one GitHub grant that needs no client secret,
 * which is exactly why it was chosen: a browser extension cannot keep a secret, and every
 * other flow would have forced a server to sit between the user and their own repo.
 *
 * To enable it for a build:
 *   1. github.com/settings/developers -> New OAuth App
 *   2. Any name and homepage URL; the callback URL is unused by the device flow
 *   3. On the app's page, tick "Enable Device Flow"
 *   4. Paste the Client ID below
 *
 * Left blank in the repo on purpose. A fork should register its own app rather than
 * inherit someone else's, and an unset value degrades cleanly: the UI hides the
 * "Connect with GitHub" button and offers the personal access token path, which needs no
 * registration at all and grants strictly narrower access.
 */
export const GITHUB_CLIENT_ID = '';

export function isDeviceFlowConfigured(): boolean {
  return GITHUB_CLIENT_ID.trim().length > 0;
}

/**
 * Requested when the target repo is public. `public_repo` cannot touch private repos at
 * all, so it is the right default even though it means re-authorising to use a private
 * one — an OAuth App scope is account-wide, and the narrower grant should be the one
 * people fall into by accident.
 */
export const SCOPE_PUBLIC = 'public_repo';

/** Required for a private solutions repo. Grants read/write to every repo on the account. */
export const SCOPE_PRIVATE = 'repo';

/**
 * Host permissions the integration needs, requested at connect time rather than at
 * install. Someone who never connects GitHub never grants them.
 */
export const GITHUB_ORIGINS = ['https://github.com/*', 'https://api.github.com/*'];

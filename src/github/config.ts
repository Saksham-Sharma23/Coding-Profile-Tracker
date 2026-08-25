/**
 * OAuth App client id used for the GitHub Device Flow.
 *
 * Public by design. The Device Flow is the one GitHub grant that needs no client secret,
 * which is exactly why it was chosen: a browser extension cannot keep a secret, and every
 * other flow would have forced a server to sit between the user and their own repo.
 *
 * This one belongs to the app users see on the approval screen. It identifies the
 * *application*, never an account: every user authorises their own GitHub against it and
 * their token is minted for them alone, so one public id serves everybody.
 *
 * The app is registered with "Expire user access tokens" OFF. Turning it on would make
 * GitHub issue 8-hour tokens plus a refresh_token, and pollForToken() reads only
 * access_token — so every user would be silently disconnected twice a day. Adding refresh
 * support is the prerequisite for changing that, not a setting to flip on its own.
 *
 * Forking? Register your own app rather than inheriting this one:
 *   1. github.com/settings/developers -> New OAuth App
 *   2. Any name and homepage URL; delete the redirect URI, the device flow never redirects
 *   3. Tick "Enable Device Flow"; leave "Expire user access tokens" unticked
 *   4. Paste the Client ID below. No client secret is needed — do not generate one.
 *
 * Blanking it degrades cleanly rather than breaking: the UI hides the "Connect with
 * GitHub" button and offers the personal access token path, which needs no registration
 * at all and grants strictly narrower access.
 */
export const GITHUB_CLIENT_ID = 'Ov23liAxefxwrIy1K70y';

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

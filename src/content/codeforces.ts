import { detectWithRetry } from './detect';

/**
 * Codeforces renders the logged-in handle server-side in the header lang-chooser
 * area, as a link to /profile/<handle>. Its markup is plain enough that the
 * profile-link scan would also match other users' handles in comment threads, so
 * this reads the header region specifically.
 */
detectWithRetry('codeforces', () => {
  const header = document.querySelector('#header, .lang-chooser');
  const link = header?.querySelector<HTMLAnchorElement>('a[href*="/profile/"]');
  const match = /\/profile\/([^/?#]+)/.exec(link?.getAttribute('href') ?? '');
  return match?.[1];
});

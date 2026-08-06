import { detectWithRetry } from './detect';

/**
 * CodeChef puts the logged-in user's own profile link in the header dropdown, as
 * /users/<handle>. A page-wide scan would also match the ranklists and discussion
 * threads that link to *other* users, so this reads the header region only.
 */
detectWithRetry('codechef', () => {
  const header = document.querySelector('header, #header, .navbar, .h-nav');
  const links = header?.querySelectorAll<HTMLAnchorElement>('a[href*="/users/"]') ?? [];

  for (const link of links) {
    const match = /\/users\/([^/?#]+)\/?$/.exec(link.getAttribute('href') ?? '');
    if (match?.[1]) return match[1];
  }
  return undefined;
});

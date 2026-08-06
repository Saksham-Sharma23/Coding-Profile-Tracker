import { detectWithRetry } from './detect';

/**
 * GeeksforGeeks links the signed-in user to /user/<handle>/ from the header account
 * menu. Article pages link to author profiles with the same pattern, so this is scoped
 * to the header rather than scanning the whole document.
 */
detectWithRetry('geeksforgeeks', () => {
  const header = document.querySelector('header, .gfg-header, nav');
  const links = header?.querySelectorAll<HTMLAnchorElement>('a[href*="/user/"]') ?? [];

  for (const link of links) {
    const match = /\/user\/([^/?#]+)\/?$/.exec(link.getAttribute('href') ?? '');
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return undefined;
});

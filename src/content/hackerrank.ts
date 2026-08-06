import { reportDetected } from './detect';

/**
 * HackerRank exposes the signed-in user on its own REST endpoint, which is far more
 * reliable than scraping its client-rendered nav. This is a same-origin request from
 * the page, so it carries the session cookie and needs no host permission.
 */
async function detect(attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch('/rest/contests/master/hackers/me/profile', {
        credentials: 'include',
      });
      if (res.ok) {
        const body = (await res.json()) as { model?: { username?: string } };
        if (body.model?.username) {
          reportDetected('hackerrank', body.model.username);
          return;
        }
      }
    } catch {
      // Logged out, or the endpoint moved. Either way there is nothing to suggest.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

void detect();

import type { PlatformId } from '@/platforms/types';

/**
 * Reads the logged-in username off the current page and reports it to the service
 * worker as a *suggestion*. It never becomes the tracked handle without the user
 * confirming in the options page — manual entry stays the source of truth so the
 * extension keeps working while logged out.
 */
export function reportDetected(platform: PlatformId, handle: string | undefined): void {
  const trimmed = handle?.trim();
  if (!trimmed || trimmed.length > 64) return;
  void chrome.runtime.sendMessage({ type: 'handle-detected', platform, handle: trimmed });
}

/**
 * These sites render their nav client-side, so the username is often absent at
 * document_idle. Retries briefly, then gives up rather than observing forever.
 */
export function detectWithRetry(
  platform: PlatformId,
  read: () => string | undefined,
  attempts = 10,
  intervalMs = 700,
): void {
  let left = attempts;
  const tick = () => {
    const found = read();
    if (found) {
      reportDetected(platform, found);
      return;
    }
    if (--left > 0) setTimeout(tick, intervalMs);
  };
  tick();
}

/** Pulls a username out of the first link matching a profile URL pattern. */
export function fromProfileLink(pattern: RegExp): string | undefined {
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    const match = pattern.exec(href);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return undefined;
}

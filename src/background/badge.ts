/**
 * The count on the toolbar icon.
 *
 * It reuses the same `solvedToday` the popup renders, so the badge and the popup can
 * never disagree — the "measure against yesterday, not against the last recorded day"
 * rule lives in exactly one place.
 */
import { orderedAdapters } from '@/platforms/registry';
import { visiblePlatforms, solvedToday, type TodayProgress } from '@/shared/progress';
import { isoDay, readState } from '@/storage/repo';

/** Matches --viz-1 (light), the validated slot the popup's own progress ring uses. */
const BADGE_BG = '#2a78d6';

/**
 * Badge text for today's progress. Empty means "show nothing" — an unmeasured day and
 * a day with no solves both leave the icon clean rather than sitting at a nagging 0.
 * Chrome truncates past ~4 characters, so large counts compact.
 */
export function badgeText(progress: TodayProgress): string {
  const solved = progress.solved;
  if (solved === undefined || solved <= 0) return '';
  if (solved >= 1000) return `${Math.floor(solved / 1000)}k+`;
  return String(solved);
}

/**
 * Recomputes and paints the badge. Called after every refresh.
 *
 * The count only moves when a refresh lands, so after midnight the badge keeps
 * yesterday's number until the next refresh — at most one interval, and correcting it
 * would mean an extra alarm firing every midnight for a purely cosmetic gain.
 */
export async function updateBadge(): Promise<void> {
  try {
    const state = await readState();
    const tracked = visiblePlatforms(state, orderedAdapters(state.settings.order, []));
    const text = badgeText(solvedToday(state, tracked, isoDay(Date.now())));

    await chrome.action.setBadgeText({ text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_BG });
      // Chrome 110+. Older builds pick their own contrasting colour.
      await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
    }
  } catch {
    // A badge is decoration; never let it take down a refresh.
  }
}

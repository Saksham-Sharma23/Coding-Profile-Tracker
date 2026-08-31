/**
 * The optional daily nudge.
 *
 * A repeating alarm is the only scheduling primitive MV3 offers, and Chrome fires
 * alarms it missed while the browser was closed. That means the reminder alarm can go
 * off at 3am on a laptop opened after a weekend away — so the hour is checked again at
 * fire time rather than trusted from the schedule.
 */
import { customAdapters } from '@/platforms/custom/adapter';
import { orderedAdapters } from '@/platforms/registry';
import { solvedToday, visiblePlatforms } from '@/shared/progress';
import { isoDay, readState } from '@/storage/repo';
import type { ReminderSettings } from '@/storage/schema';

export const REMINDER_ALARM = 'tracker-reminder';
const NOTIFICATION_ID = 'tracker-daily';

/** How far past the target hour a catch-up firing may still notify. */
export const REMINDER_WINDOW_HOURS = 2;

/**
 * Milliseconds until the next local occurrence of `hour`. Always strictly positive, so
 * an alarm scheduled at exactly the target hour lands tomorrow rather than immediately.
 */
export function msUntilHour(hour: number, now: number): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now;
}

/**
 * Whether a firing at `now` is close enough to the target hour to be worth showing.
 *
 * A late catch-up inside the window still notifies — the point of the reminder is the
 * evening, and 20:40 is still the evening. Anything further out is a missed alarm
 * surfacing at the wrong time of day, and is dropped.
 */
export function withinReminderWindow(hour: number, now: number): boolean {
  /*
   * Wrapped into 0..23 rather than a bare subtraction.
   *
   * A plain `getHours() - hour` cannot express a window that crosses midnight: with the
   * reminder set to 23:00, a catch-up firing at 00:30 gives 0 - 23 = -23 and is thrown
   * away as "not yet". A 23:00 reminder could therefore never fire from a catch-up at
   * all, which looked exactly like the setting failing to save.
   */
  const elapsed = (new Date(now).getHours() - hour + 24) % 24;
  return elapsed < REMINDER_WINDOW_HOURS;
}

/**
 * Arms the next firing.
 *
 * A one-shot rather than a repeating alarm, re-armed from `maybeNotify` after each fire.
 * A fixed `periodInMinutes: 24 * 60` drifts an hour across every DST transition and stays
 * drifted until settings happen to be saved again; re-anchoring on the wall clock each
 * time keeps an 8pm reminder at 8pm all year.
 */
export async function scheduleReminder(reminder: ReminderSettings): Promise<void> {
  await chrome.alarms.clear(REMINDER_ALARM);
  if (!reminder.enabled) return;

  await chrome.alarms.create(REMINDER_ALARM, {
    delayInMinutes: msUntilHour(reminder.hour, Date.now()) / 60_000,
  });
}

/**
 * Notifies only when today is genuinely behind. An unmeasured day says nothing — with
 * no baseline the extension cannot tell whether the user has done the work or not, and
 * guessing wrong in the nagging direction is the worse mistake.
 */
export async function maybeNotify(now = Date.now()): Promise<boolean> {
  const state = await readState();
  const { reminder, dailyGoal } = state.settings;

  // The alarm is one-shot, so tomorrow's has to be armed whatever today's outcome is —
  // including the early returns below, which are all "nothing to say today", not
  // "stop reminding me".
  if (reminder.enabled) await scheduleReminder(reminder);

  if (!reminder.enabled || !withinReminderWindow(reminder.hour, now)) return false;

  const tracked = visiblePlatforms(
    state,
    orderedAdapters(state.settings.order, customAdapters(state.settings.custom)),
  );
  if (!tracked.length) return false;

  const { solved } = solvedToday(state, tracked, isoDay(now));
  if (solved === undefined) return false;

  const target = dailyGoal > 0 ? dailyGoal : 1;
  if (solved >= target) return false;

  await chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-128.png'),
    title: solved === 0 ? 'Nothing solved today' : `${solved} of ${target} solved today`,
    message:
      dailyGoal > 0
        ? `You are ${target - solved} short of your daily goal.`
        : 'A quick problem keeps the streak alive.',
    priority: 0,
  });
  return true;
}

export function openDashboardFromNotification(id: string): void {
  if (id !== NOTIFICATION_ID) return;
  void chrome.notifications.clear(id);
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/dashboard/index.html') });
}

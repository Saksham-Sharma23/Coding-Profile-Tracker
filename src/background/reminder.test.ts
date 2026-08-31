import { describe, expect, it } from 'vitest';
import { msUntilHour, withinReminderWindow, REMINDER_WINDOW_HOURS } from './reminder';

/** Local-time helper: the reminder hour is a wall-clock hour, not a UTC one. */
const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime();

describe('msUntilHour', () => {
  it('counts forward to today when the hour is still ahead', () => {
    expect(msUntilHour(20, at(2026, 8, 6, 18, 30))).toBe(90 * 60_000);
  });

  it('rolls over to tomorrow once the hour has passed', () => {
    expect(msUntilHour(20, at(2026, 8, 6, 21))).toBe(23 * 60 * 60_000);
  });

  it('never returns zero, so an alarm set exactly on the hour lands tomorrow', () => {
    const delay = msUntilHour(20, at(2026, 8, 6, 20));
    expect(delay).toBe(24 * 60 * 60_000);
    expect(delay).toBeGreaterThan(0);
  });

  it('crosses a day boundary correctly', () => {
    // 23:30 with a 1am target is 90 minutes away, on the next calendar day.
    expect(msUntilHour(1, at(2026, 8, 6, 23, 30))).toBe(90 * 60_000);
  });
});

describe('withinReminderWindow', () => {
  it('accepts the target hour and a short catch-up after it', () => {
    expect(withinReminderWindow(20, at(2026, 8, 6, 20))).toBe(true);
    expect(withinReminderWindow(20, at(2026, 8, 6, 21, 45))).toBe(true);
  });

  it('rejects a firing far from the target hour', () => {
    // Chrome replays alarms it missed while the browser was closed. Without this
    // guard, opening a laptop at 3am produces a "you have not solved today" popup.
    expect(withinReminderWindow(20, at(2026, 8, 7, 3))).toBe(false);
    expect(withinReminderWindow(20, at(2026, 8, 6, 22))).toBe(false);
    expect(withinReminderWindow(20, at(2026, 8, 6, 19, 59))).toBe(false);
  });

  it('uses the documented window width', () => {
    expect(withinReminderWindow(9, at(2026, 8, 6, 9 + REMINDER_WINDOW_HOURS - 1))).toBe(true);
    expect(withinReminderWindow(9, at(2026, 8, 6, 9 + REMINDER_WINDOW_HOURS))).toBe(false);
  });

  it('allows a catch-up that crosses midnight', () => {
    // A 23:00 reminder firing late at 00:30 is half an hour past, not 23 hours early.
    // A bare subtraction read this as -23 and suppressed it, so a reminder set to 23:00
    // could never fire from a catch-up at all.
    expect(withinReminderWindow(23, at(2026, 8, 7, 0, 30))).toBe(true);
    expect(withinReminderWindow(23, at(2026, 8, 6, 23, 15))).toBe(true);
  });

  it('still rejects a catch-up that crossed midnight too late', () => {
    // 03:00 against a 23:00 target is four hours past — a missed alarm surfacing at the
    // wrong time of day, which is exactly what the window exists to drop.
    expect(withinReminderWindow(23, at(2026, 8, 7, 3))).toBe(false);
    // And the far side: 22:00 is an hour early, not 23 hours late.
    expect(withinReminderWindow(23, at(2026, 8, 6, 22))).toBe(false);
  });
});

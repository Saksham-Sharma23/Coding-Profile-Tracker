import { customAdapters } from '@/platforms/custom/adapter';
import { getAdapter } from '@/platforms/registry';
import { getSettings, readState, updateState } from '@/storage/repo';
import { updateBadge } from './badge';
import type { Message, Response } from './messages';
import { refreshAll } from './refresh';
import {
  maybeNotify,
  openDashboardFromNotification,
  REMINDER_ALARM,
  scheduleReminder,
} from './reminder';
import { ALARM_NAME, scheduleRefresh } from './scheduler';

const VALIDATE_TIMEOUT_MS = 15_000;

/** Re-arms both alarms from stored settings. */
async function rearm(): Promise<void> {
  await scheduleRefresh();
  await scheduleReminder((await getSettings()).reminder);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await rearm();
  // Send new users straight to the options page — the extension does nothing
  // until at least one handle is configured.
  if (details.reason === 'install') {
    await chrome.runtime.openOptionsPage();
  }
});

// Alarms survive worker restarts, but re-arming on startup guards against the alarm
// being lost after a browser update or profile migration.
chrome.runtime.onStartup.addListener(() => {
  void rearm();
  // The badge is not persisted across restarts, so repaint it from stored state.
  void updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void refreshAll();
  // Refresh first: a reminder that fires on stale numbers could nag about work the
  // user has already done.
  if (alarm.name === REMINDER_ALARM) void refreshAll().then(() => maybeNotify());
});

chrome.notifications.onClicked.addListener(openDashboardFromNotification);

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err: unknown) =>
      sendResponse({ type: 'error', error: err instanceof Error ? err.message : String(err) }),
    );
  // Keeps the message channel open for the async work above.
  return true;
});

async function handle(message: Message): Promise<Response> {
  switch (message.type) {
    case 'refresh': {
      const outcomes = await refreshAll(message.platforms);
      return { type: 'refresh-result', outcomes };
    }

    case 'validate-handle': {
      const { settings } = await readState();
      const adapter = getAdapter(message.platform, customAdapters(settings.custom));
      if (!adapter) return { type: 'validate-result', ok: false, error: 'Not supported yet' };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
      try {
        await adapter.fetchStats(message.handle.trim(), controller.signal);
        return { type: 'validate-result', ok: true };
      } catch (err) {
        return {
          type: 'validate-result',
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        clearTimeout(timer);
      }
    }

    case 'reschedule':
      await rearm();
      return { type: 'ack' };

    case 'handle-detected':
      // Stored as a suggestion only; the options page still requires an explicit
      // confirmation before it becomes the handle we track.
      await updateState((state) => {
        state.detected[message.platform] = message.handle;
      });
      return { type: 'ack' };
  }
}

import { OFFSCREEN_REQUEST_TYPES } from '@/offscreen/protocol';
import { customAdapters } from '@/platforms/custom/adapter';
import { getAdapter } from '@/platforms/registry';
import { getSettings, readState, updateState } from '@/storage/repo';
import { updateBadge } from './badge';
import {
  GITHUB_ALARM,
  handleDeviceFlowPort,
  handleGithubMessage,
  runQueue,
  scheduleQueueRetry,
} from './github';
import { applyIconBehavior, restoreIconBehavior } from './icon-behavior';
import { DEVICE_FLOW_PORT, type Message, type Response } from './messages';
import { refreshAll } from './refresh';
import {
  maybeNotify,
  openDashboardFromNotification,
  REMINDER_ALARM,
  scheduleReminder,
} from './reminder';
import { ALARM_NAME, scheduleRefresh } from './scheduler';

const VALIDATE_TIMEOUT_MS = 15_000;

/** Re-arms every alarm from stored state. */
async function rearm(): Promise<void> {
  await scheduleRefresh();
  await scheduleReminder((await getSettings()).reminder);
  await scheduleQueueRetry();
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await rearm();
  await restoreIconBehavior();
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
  // Neither is chrome.action.setPopup, so the icon preference has to be re-applied or
  // it quietly reverts to the popup on every browser restart.
  void restoreIconBehavior();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void refreshAll();
  // Refresh first: a reminder that fires on stale numbers could nag about work the
  // user has already done.
  if (alarm.name === REMINDER_ALARM) void refreshAll().then(() => maybeNotify());
  if (alarm.name === GITHUB_ALARM) void runQueue();
});

chrome.notifications.onClicked.addListener(openDashboardFromNotification);

// The Device Flow polls for minutes on end, so it runs over a port whose lifetime keeps
// the worker awake, rather than as a request/response message.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === DEVICE_FLOW_PORT) handleDeviceFlowPort(port);
});

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  /*
   * The offscreen document listens on the same runtime channel, so its parse requests
   * arrive here too. Without this guard both listeners answer and whichever replies
   * first wins — and this one would reply `undefined`, failing a parse that actually
   * succeeded.
   */
  if (OFFSCREEN_REQUEST_TYPES.has((message as { type?: string })?.type ?? '')) return false;

  handle(message)
    .then(sendResponse)
    .catch((err: unknown) =>
      sendResponse({ type: 'error', error: err instanceof Error ? err.message : String(err) }),
    );
  // Keeps the message channel open for the async work above.
  return true;
});

async function handle(message: Message): Promise<Response> {
  // GitHub and capture messages live in their own module; everything else falls through.
  const handled = await handleGithubMessage(message);
  if (handled) return handled;

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

    case 'apply-icon-behavior':
      // Sent by the settings UI so the choice takes effect immediately, rather than
      // waiting for the next browser start.
      await applyIconBehavior(message.pref);
      return { type: 'ack' };

    case 'handle-detected': {
      // Stored as a suggestion only; the options page still requires an explicit
      // confirmation before it becomes the handle we track.
      await updateState((state) => {
        state.detected[message.platform] = message.handle;
      });
      return { type: 'ack' };
    }

    default:
      /*
       * Every remaining variant belongs to handleGithubMessage, which ran first and
       * returned before we got here. Reaching this point means a message type was added
       * to the union and wired into neither switch.
       */
      return { type: 'error', error: `Unhandled message: ${(message as Message).type}` };
  }
}

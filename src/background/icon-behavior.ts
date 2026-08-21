import { getSettings } from '@/storage/repo';
import type { IconOpens } from '@/storage/schema';

/** Must match `action.default_popup` in manifest.config.ts. */
const POPUP_PATH = 'src/ui/popup/index.html';

/**
 * Whether this browser has the side panel at all.
 *
 * `chrome.sidePanel` arrived in Chrome 114 and `open()` in 116. The extension still has
 * to run on older Chromium builds, so every caller checks rather than throwing, and the
 * settings UI hides the choice entirely instead of offering a switch that does nothing.
 */
export function sidePanelSupported(): boolean {
  return typeof chrome.sidePanel?.setPanelBehavior === 'function';
}

/**
 * Points the toolbar icon at whichever surface the user picked.
 *
 * The two calls belong together and must never be made apart: a `default_popup` takes
 * precedence over `openPanelOnActionClick`, so leaving the popup registered would make
 * the panel setting look broken, and clearing the popup without enabling the panel
 * would make the icon do nothing at all.
 */
export async function applyIconBehavior(pref: IconOpens): Promise<void> {
  if (!sidePanelSupported()) return;

  const panel = pref === 'sidepanel';
  await chrome.action.setPopup({ popup: panel ? '' : POPUP_PATH });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: panel });
}

/**
 * Re-applies the stored preference.
 *
 * This has to run on startup, not only when the setting changes. `chrome.action.setPopup`
 * is a runtime override of the manifest's `default_popup` and **does not survive a
 * browser restart** — without this call the preference would silently revert to the
 * popup every morning, which looks exactly like the setting not saving.
 */
export async function restoreIconBehavior(): Promise<void> {
  try {
    await applyIconBehavior((await getSettings()).iconOpens);
  } catch {
    // The icon still opens the popup from the manifest default, so a failure here
    // costs a preference, never access to the extension.
  }
}

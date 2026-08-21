import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSettings } from '@/storage/repo';
import { mockChromeStorage, type ChromeStub } from '@/test/chrome-storage';
import { applyIconBehavior, restoreIconBehavior, sidePanelSupported } from './icon-behavior';

let stub: ChromeStub;
let setPopup: ReturnType<typeof vi.fn>;
let setPanelBehavior: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stub = mockChromeStorage();
  setPopup = vi.fn(async () => {});
  setPanelBehavior = vi.fn(async () => {});
  stub.chrome.action = { setPopup };
  stub.chrome.sidePanel = { setPanelBehavior, open: async () => {} };
});

describe('applyIconBehavior', () => {
  it('clears the popup and enables the panel for "sidepanel"', () => {
    /*
     * Both halves matter and must move together. A registered default_popup overrides
     * openPanelOnActionClick, so leaving the popup in place would make the setting look
     * broken while reporting success.
     */
    return applyIconBehavior('sidepanel').then(() => {
      expect(setPopup).toHaveBeenCalledWith({ popup: '' });
      expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
    });
  });

  it('restores the popup and disables the panel for "popup"', async () => {
    await applyIconBehavior('popup');
    expect(setPopup).toHaveBeenCalledWith({ popup: 'src/ui/popup/index.html' });
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
  });

  it('never clears the popup without enabling the panel', async () => {
    // That combination is the one that leaves the toolbar icon doing nothing at all.
    await applyIconBehavior('popup');
    const cleared = setPopup.mock.calls.some(([arg]) => arg.popup === '');
    expect(cleared).toBe(false);
  });

  it('does nothing on a browser with no side panel, rather than throwing', async () => {
    // Chrome 113 and earlier. The manifest's default_popup still works, so the cost is
    // a preference, never access to the extension.
    delete stub.chrome.sidePanel;
    await expect(applyIconBehavior('sidepanel')).resolves.toBeUndefined();
    expect(setPopup).not.toHaveBeenCalled();
  });
});

describe('sidePanelSupported', () => {
  it('is false when the API is absent', () => {
    delete stub.chrome.sidePanel;
    expect(sidePanelSupported()).toBe(false);
  });

  it('is true when it is present', () => {
    expect(sidePanelSupported()).toBe(true);
  });
});

describe('restoreIconBehavior', () => {
  it('re-applies the stored preference', async () => {
    /*
     * The reason this exists at all: chrome.action.setPopup is a runtime override of the
     * manifest and does NOT survive a browser restart. Without a call on startup the
     * preference silently reverts to the popup every morning, which reads exactly like
     * the setting failing to save.
     */
    await saveSettings({ iconOpens: 'sidepanel' });
    await restoreIconBehavior();

    expect(setPopup).toHaveBeenCalledWith({ popup: '' });
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });

  it('defaults a fresh install to the popup', async () => {
    await restoreIconBehavior();
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
  });

  it('swallows a storage failure instead of taking down the worker', async () => {
    stub.chrome.storage = {
      local: {
        get: async () => {
          throw new Error('storage is gone');
        },
      },
    };
    await expect(restoreIconBehavior()).resolves.toBeUndefined();
  });
});

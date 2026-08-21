import { useEffect, useState } from 'react';
import type { BuiltinPlatformId } from '@/platforms/types';
import { platformForUrl } from '@/shared/site-match';

/**
 * The platform whose site is in the tab in front of the panel, if any.
 *
 * Deliberately reads the tab rather than being told by a content script: the panel
 * needs this on every tab switch, including tabs the content scripts never ran in.
 *
 * **No `tabs` permission.** `chrome.tabs.query` works without it; Chrome simply omits
 * `url` unless the extension already holds a host permission for that tab. Since the
 * only hosts granted are the five tracked platforms, every other page arrives here as
 * `undefined` — the panel cannot see what else is being browsed even in principle.
 */
export function useActivePlatform(): BuiltinPlatformId | undefined {
  const [platform, setPlatform] = useState<BuiltinPlatformId>();

  useEffect(() => {
    let active = true;

    const read = () => {
      chrome.tabs
        ?.query({ active: true, currentWindow: true })
        .then((tabs) => {
          if (active) setPlatform(platformForUrl(tabs[0]?.url));
        })
        // A window with no active tab, or a query rejected while the panel is closing.
        // There is simply no platform to surface; that is not an error worth showing.
        .catch(() => active && setPlatform(undefined));
    };

    read();

    // Neither event carries a URL without the `tabs` permission, so both just prompt a
    // re-query rather than being read directly.
    const onActivated = () => read();
    const onUpdated = () => read();

    chrome.tabs?.onActivated.addListener(onActivated);
    chrome.tabs?.onUpdated.addListener(onUpdated);

    return () => {
      active = false;
      chrome.tabs?.onActivated.removeListener(onActivated);
      chrome.tabs?.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return platform;
}

import { extractCodechef } from './extract';
import type { ParseRequest, ParseResponse } from './protocol';

/**
 * MV3 service workers have no DOMParser, so HTML parsing is delegated to this
 * offscreen document. It holds no state and does nothing but parse on request.
 */
chrome.runtime.onMessage.addListener(
  (message: ParseRequest, _sender, sendResponse: (response: ParseResponse) => void) => {
    if (message?.type !== 'parse-codechef') return;

    try {
      const doc = new DOMParser().parseFromString(message.html, 'text/html');
      sendResponse({ type: 'parse-result', fields: extractCodechef(doc) });
    } catch (err) {
      sendResponse({
        type: 'parse-result',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  },
);

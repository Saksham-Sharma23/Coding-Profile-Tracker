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
      // The byte count rides along so an unrecognised page can report its own size.
      // Diagnostic only, never a signal: CodeChef's landing page is ~85KB and a modest
      // real profile ~80KB, so size cannot tell them apart — but knowing which of those
      // arrived is the first thing anyone debugging a broken parser wants.
      sendResponse({ type: 'parse-result', fields: extractCodechef(doc, message.html.length) });
    } catch (err) {
      sendResponse({
        type: 'parse-result',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  },
);

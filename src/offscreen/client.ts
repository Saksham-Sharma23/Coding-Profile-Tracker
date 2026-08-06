import type { CodechefFields, ParseRequest, ParseResponse } from './protocol';

const PATH = 'src/offscreen/offscreen.html';

/** Chrome allows only one offscreen document per extension, so creation is guarded. */
let creating: Promise<void> | undefined;

async function ensureDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  });
  if (existing.length > 0) return;

  // Concurrent refreshes would otherwise race and hit "Only a single offscreen
  // document may be created".
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: PATH,
        reasons: ['DOM_PARSER' as chrome.offscreen.Reason],
        justification: 'Parse fetched profile HTML, which service workers cannot do.',
      })
      .finally(() => {
        creating = undefined;
      });
  }
  await creating;
}

export async function parseCodechefHtml(html: string): Promise<CodechefFields> {
  await ensureDocument();
  const request: ParseRequest = { type: 'parse-codechef', html };
  const response = (await chrome.runtime.sendMessage(request)) as ParseResponse | undefined;

  if (!response?.fields) {
    throw new Error(response?.error ?? 'offscreen parser did not respond');
  }
  return response.fields;
}

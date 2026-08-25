import type {
  CodechefFields,
  MarkdownRequest,
  MarkdownResponse,
  ParseRequest,
  ParseResponse,
} from './protocol';

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
        justification:
          'Parse fetched profile HTML and convert problem statements to Markdown, ' +
          'which service workers cannot do.',
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

/**
 * Converts a problem statement to Markdown.
 *
 * Returns undefined rather than throwing when the conversion fails: a statement is the
 * one part of a pushed problem that is nice-to-have. Losing the description is a poor
 * reason to abandon a commit that still carries the code the user actually wrote.
 */
export async function htmlToMarkdownOffscreen(html: string): Promise<string | undefined> {
  if (!html.trim()) return undefined;

  try {
    await ensureDocument();
    const request: MarkdownRequest = { type: 'html-to-markdown', html };
    const response = (await chrome.runtime.sendMessage(request)) as MarkdownResponse | undefined;
    return response?.markdown || undefined;
  } catch {
    return undefined;
  }
}

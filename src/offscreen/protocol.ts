/**
 * What the fetched page turned out to be.
 *
 * Deliberately three-valued. It used to be a single `isProfilePage` boolean derived
 * from whether `.rating-number` was present, which conflated three different
 * situations and resolved all of them to "no such user" — so a real account with no
 * rating, and a page we simply did not recognise, both told the user to go fix a
 * username that was correct.
 */
export type CodechefPageKind =
  /** A real profile. Says nothing about which numbers it carried. */
  | 'profile'
  /** CodeChef's marketing landing page, which is what an unknown username returns. */
  | 'not-found'
  /** Something else entirely — a layout change, an interstitial, a challenge page. */
  | 'unrecognised';

/** Fields extracted from a CodeChef profile page by the offscreen parser. */
export interface CodechefFields {
  pageKind: CodechefPageKind;
  /** The page title and size, so an unrecognised page can report what actually arrived. */
  title?: string;
  bytes: number;
  rating?: number;
  highestRating?: number;
  stars?: number;
  solved?: number;
  globalRank?: number;
}

export interface ParseRequest {
  type: 'parse-codechef';
  html: string;
}

export interface ParseResponse {
  type: 'parse-result';
  fields?: CodechefFields;
  error?: string;
}

/**
 * Converts a LeetCode problem statement to Markdown for the GitHub push.
 *
 * Handled here rather than on the push path because the conversion needs a real DOM and
 * the service worker has none — the same constraint that put the CodeChef parser here.
 */
export interface MarkdownRequest {
  type: 'html-to-markdown';
  html: string;
}

export interface MarkdownResponse {
  type: 'markdown-result';
  markdown?: string;
  error?: string;
}

export type OffscreenRequest = ParseRequest | MarkdownRequest;

/** Message types the offscreen document owns, so other listeners can ignore them. */
export const OFFSCREEN_REQUEST_TYPES = new Set<string>(['parse-codechef', 'html-to-markdown']);

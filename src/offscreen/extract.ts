import type { CodechefFields, CodechefPageKind } from './protocol';

/**
 * CodeChef renders more than one rating block: the classic rating in
 * `#rating-block-all`, and a separate "DSA Rating" in `#rating-block-dsa-monday` whose
 * numbers are unrelated — as of this writing a 7★ account reads 3355 in the first and
 * a highest of 0 in the second.
 *
 * Every rating query is therefore scoped to the classic block. A bare `.rating-number`
 * lookup happens to hit the right one today only because that block is emitted first;
 * the moment CodeChef reorders them the extension would report the DSA rating as the
 * CodeChef rating, with nothing on screen to say so. A silently wrong number is worse
 * than a visible error, and worse still than no number at all.
 */
const RATING_BLOCK = '#rating-block-all';

/** Markup that only a real profile page carries. */
const PROFILE_SHELL = '.user-profile-container, .user-details-container';

/**
 * Pure DOM extraction, kept out of offscreen.ts so it can be unit-tested against a
 * captured fixture without any chrome APIs.
 *
 * `bytes` is the size of the HTML this document was parsed from, carried through only
 * so an unrecognised page can report what actually arrived.
 */
export function extractCodechef(doc: Document, bytes = 0): CodechefFields {
  const title = doc.querySelector('title')?.textContent?.trim() || undefined;
  const kind = pageKind(doc, title);

  // Reading numbers off a page that is not a profile would be inventing them.
  if (kind !== 'profile') return { pageKind: kind, bytes, ...(title && { title }) };

  const block = doc.querySelector(RATING_BLOCK) ?? doc;

  const rating = firstNumber(text(block, '.rating-number'));

  // Rendered as one <span>★</span> per star.
  const starSpans = block.querySelectorAll('.rating-star span');

  // Sits in a <small> next to the current rating, e.g. "(Highest Rating 3445)".
  const highest = firstNumber(
    [...block.querySelectorAll('small')]
      .map((el) => el.textContent ?? '')
      .find((t) => /highest rating/i.test(t)),
  );

  // Ranks read "Inactive" for users not currently rated, so this is often absent.
  const globalRank = firstNumber(
    [...block.querySelectorAll('.rating-ranks li')]
      .find((li) => /global rank/i.test(li.textContent ?? ''))
      ?.querySelector('strong')?.textContent,
  );

  // "Total Problems Solved: 632". Document-wide: it sits outside the rating blocks.
  const solved = firstNumber(
    [...doc.querySelectorAll('h3')]
      .map((el) => el.textContent ?? '')
      .find((t) => /total problems solved/i.test(t)),
  );

  return {
    pageKind: 'profile',
    bytes,
    ...(title && { title }),
    ...(rating !== undefined && { rating }),
    ...(highest !== undefined && { highestRating: highest }),
    ...(starSpans.length > 0 && { stars: starSpans.length }),
    ...(solved !== undefined && { solved }),
    ...(globalRank !== undefined && { globalRank }),
  };
}

/**
 * Whether this is a profile page at all — decided from the profile shell, and
 * deliberately not from the rating.
 *
 * The rating block is absent for an account that has never entered a rated contest, so
 * keying existence off `.rating-number` reported real users as "no such user" and sent
 * them to correct a username that was right. The shell proves the account exists; the
 * rating is one field on it, and an absent field is not an absent person.
 *
 * Anything unfamiliar returns 'unrecognised' rather than 'not-found'. Guessing
 * "no such user" for a page we cannot read is a confident answer to a question we did
 * not actually ask, and it is the one wrong answer that wastes the user's time.
 */
function pageKind(doc: Document, title: string | undefined): CodechefPageKind {
  if (doc.querySelector(PROFILE_SHELL)) return 'profile';
  // Two independent signals, because losing this one costs the user their history:
  // the title reads "<handle> - CodeChef User Profile with global rank N".
  if (title && /codechef user profile/i.test(title)) return 'profile';

  // CodeChef answers an unknown username with its marketing landing page and HTTP 200,
  // so this title is the only signal that the user genuinely does not exist.
  if (title && /learn and practice coding/i.test(title)) return 'not-found';

  return 'unrecognised';
}

function text(root: ParentNode, selector: string): string | undefined {
  return root.querySelector(selector)?.textContent ?? undefined;
}

/** Pulls the first integer out of a string, tolerating commas and surrounding text. */
function firstNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = /-?\d[\d,]*/.exec(value);
  if (!match) return undefined;
  const parsed = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

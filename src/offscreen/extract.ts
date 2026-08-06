import type { CodechefFields } from './protocol';

/**
 * Pure DOM extraction, kept out of offscreen.ts so it can be unit-tested against a
 * captured fixture without any chrome APIs.
 */
export function extractCodechef(doc: Document): CodechefFields {
  const ratingText = text(doc, '.rating-number');
  const rating = firstNumber(ratingText);

  // CodeChef serves its generic landing page (HTTP 200) for unknown usernames, so
  // the absence of this element is how a missing profile is detected.
  const isProfilePage = doc.querySelector('.rating-number') !== null;

  // Rendered as one <span>★</span> per star.
  const starSpans = doc.querySelectorAll('.rating-star span');

  // Sits in a <small> next to the current rating, e.g. "(Highest Rating 3445)".
  const highest = firstNumber(
    [...doc.querySelectorAll('small')]
      .map((el) => el.textContent ?? '')
      .find((t) => /highest rating/i.test(t)),
  );

  // "Total Problems Solved: 632"
  const solved = firstNumber(
    [...doc.querySelectorAll('h3')]
      .map((el) => el.textContent ?? '')
      .find((t) => /total problems solved/i.test(t)),
  );

  // Ranks read "Inactive" for users not currently rated, so this is often absent.
  const globalRank = firstNumber(
    [...doc.querySelectorAll('.rating-ranks li')]
      .find((li) => /global rank/i.test(li.textContent ?? ''))
      ?.querySelector('strong')?.textContent,
  );

  return {
    isProfilePage,
    ...(rating !== undefined && { rating }),
    ...(highest !== undefined && { highestRating: highest }),
    ...(starSpans.length > 0 && { stars: starSpans.length }),
    ...(solved !== undefined && { solved }),
    ...(globalRank !== undefined && { globalRank }),
  };
}

function text(doc: Document, selector: string): string | undefined {
  return doc.querySelector(selector)?.textContent ?? undefined;
}

/** Pulls the first integer out of a string, tolerating commas and surrounding text. */
function firstNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = /-?\d[\d,]*/.exec(value);
  if (!match) return undefined;
  const parsed = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { extractCodechef } from './extract';
// Loaded through Vite so it works under happy-dom, where import.meta.url is not a
// file: URL and node:fs path resolution fails.
import fixture from '../platforms/__fixtures__/codechef-profile.html?raw';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** The <title> CodeChef serves for a username that does not exist. */
const LANDING = `<html><head><title>
       CodeChef - Learn and Practice Coding with Problems    </title></head>
  <body><h1>Practice. Compete. Learn.</h1></body></html>`;

describe('extractCodechef', () => {
  it('pulls every stat out of real CodeChef markup', () => {
    const fields = extractCodechef(parse(fixture));

    expect(fields.pageKind).toBe('profile');
    expect(fields.rating).toBe(3355);
    expect(fields.highestRating).toBe(3445);
    expect(fields.solved).toBe(632);
    // One <span>★</span> per star.
    expect(fields.stars).toBe(7);
  });

  it('reads the CodeChef rating, not the DSA rating that sits beside it', () => {
    // CodeChef emits #rating-block-all and #rating-block-dsa-monday. On this account
    // the DSA block reads "NA" with a highest of 0, so an unscoped lookup would drop
    // the rating entirely and report the wrong highest — silently, which is the worst
    // way for this to fail.
    const fields = extractCodechef(parse(fixture));
    expect(fields.rating).not.toBeUndefined();
    expect(fields.highestRating).not.toBe(0);
  });

  it('omits the rank when CodeChef lists the user as Inactive', () => {
    // The ranks render the word "Inactive" rather than a number; reporting 0 here
    // would read as a real rank.
    expect(extractCodechef(parse(fixture)).globalRank).toBeUndefined();
  });

  it('reads a numeric global rank when one is present', () => {
    const html = `<html><head><title>x - CodeChef User Profile</title></head><body>
      <div class="user-details-container"></div>
      <div id="rating-block-all">
        <div class="rating-number">1500</div>
        <div class="rating-ranks"><ul>
          <li><a><strong>1,234</strong></a> Global Rank</li>
          <li><a><strong>56</strong></a> Country Rank</li>
        </ul></div>
      </div></body></html>`;
    expect(extractCodechef(parse(html)).globalRank).toBe(1234);
  });

  it('still recognises a profile that has no rating at all', () => {
    // An account that has never entered a rated contest gets no rating block. This is
    // the bug that reported real users as "no such user": existence was inferred from
    // the rating, so an unrated account looked exactly like a missing one.
    const html = `<html><head><title>newbie - CodeChef User Profile | CodeChef</title></head>
      <body><div class="user-profile-container">
        <div class="user-details-container"><span class="m-username--link">newbie</span></div>
        <h3>Total Problems Solved: 4</h3>
      </div></body></html>`;

    const fields = extractCodechef(parse(html));
    expect(fields.pageKind).toBe('profile');
    expect(fields.rating).toBeUndefined();
    expect(fields.solved).toBe(4);
  });

  it('flags CodeChef’s landing page, which is how an unknown user is signalled', () => {
    // Unknown handles get the marketing landing page with HTTP 200.
    const fields = extractCodechef(parse(LANDING));
    expect(fields.pageKind).toBe('not-found');
    expect(fields.rating).toBeUndefined();
  });

  it('reports an unfamiliar page as unrecognised, never as a missing user', () => {
    // A bot interstitial, an outage page, a redesign. Calling any of these "no such
    // user" sends the user to correct a username that was never wrong.
    const html = `<html><head><title>Just a moment...</title></head>
      <body><h1>Checking your browser</h1></body></html>`;

    const fields = extractCodechef(parse(html), 4096);
    expect(fields.pageKind).toBe('unrecognised');
    expect(fields.title).toBe('Just a moment...');
    expect(fields.bytes).toBe(4096);
  });

  it('survives a page with no title at all', () => {
    const fields = extractCodechef(parse('<html><body>hi</body></html>'));
    expect(fields.pageKind).toBe('unrecognised');
    expect(fields.title).toBeUndefined();
  });
});

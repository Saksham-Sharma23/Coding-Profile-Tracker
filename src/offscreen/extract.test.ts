// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { extractCodechef } from './extract';
// Loaded through Vite so it works under happy-dom, where import.meta.url is not a
// file: URL and node:fs path resolution fails.
import fixture from '../platforms/__fixtures__/codechef-profile.html?raw';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractCodechef', () => {
  it('pulls every stat out of real CodeChef markup', () => {
    const fields = extractCodechef(parse(fixture));

    expect(fields.isProfilePage).toBe(true);
    expect(fields.rating).toBe(3355);
    expect(fields.highestRating).toBe(3445);
    expect(fields.solved).toBe(632);
    // One <span>★</span> per star.
    expect(fields.stars).toBe(7);
  });

  it('omits the rank when CodeChef lists the user as Inactive', () => {
    // The ranks render the word "Inactive" rather than a number; reporting 0 here
    // would read as a real rank.
    expect(extractCodechef(parse(fixture)).globalRank).toBeUndefined();
  });

  it('reads a numeric global rank when one is present', () => {
    const html = `<div class="rating-number">1500</div>
      <div class="rating-ranks"><ul>
        <li><a><strong>1,234</strong></a> Global Rank</li>
        <li><a><strong>56</strong></a> Country Rank</li>
      </ul></div>`;
    expect(extractCodechef(parse(html)).globalRank).toBe(1234);
  });

  it('flags a non-profile page, which is how CodeChef signals an unknown user', () => {
    // Unknown handles get the marketing landing page with HTTP 200.
    const fields = extractCodechef(parse('<html><body><h1>CodeChef</h1></body></html>'));
    expect(fields.isProfilePage).toBe(false);
    expect(fields.rating).toBeUndefined();
  });
});

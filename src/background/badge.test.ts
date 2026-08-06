import { describe, expect, it } from 'vitest';
import { badgeText } from './badge';

describe('badgeText', () => {
  it('shows the count once there is one', () => {
    expect(badgeText({ solved: 3, partial: false })).toBe('3');
    expect(badgeText({ solved: 42, partial: true })).toBe('42');
  });

  it('leaves the icon clean when there is nothing to report', () => {
    // A nagging "0" on the toolbar all day is worse than no badge, and an unmeasured
    // day has no number to show in the first place.
    expect(badgeText({ solved: 0, partial: false })).toBe('');
    expect(badgeText({ partial: false })).toBe('');
    expect(badgeText({ partial: true })).toBe('');
  });

  it('compacts counts too wide for the badge', () => {
    expect(badgeText({ solved: 999, partial: false })).toBe('999');
    expect(badgeText({ solved: 1000, partial: false })).toBe('1k+');
    expect(badgeText({ solved: 12_400, partial: false })).toBe('12k+');
  });
});

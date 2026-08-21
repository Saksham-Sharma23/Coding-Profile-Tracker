import { describe, expect, it } from 'vitest';
import type { CustomPlatform } from '@/storage/custom';
import { adapterFor, clampCount, customAdapters, manualStats, MAX_MANUAL_COUNT } from './adapter';

const def = (over: Partial<CustomPlatform> = {}): CustomPlatform => ({
  id: 'custom:striver-sde-sheet-7f3a',
  displayName: 'Striver SDE Sheet',
  accent: '#7c5cff',
  source: 'manual',
  countsTowardTotal: false,
  chartRating: false,
  ...over,
});

describe('adapterFor — manual', () => {
  it('declares itself unfetchable and handle-less', () => {
    // Both flags are load-bearing: `fetchable` keeps refreshAll from ever calling
    // fetchStats (and so from ever recording a failure on a good counter), and
    // `requiresHandle` is what lets visiblePlatforms show a platform with no username.
    const { capabilities } = adapterFor(def());
    expect(capabilities.fetchable).toBe(false);
    expect(capabilities.requiresHandle).toBe(false);
  });

  it('may fall back to the last known day, unlike anything fetched', () => {
    // For a counter, a missing day means "unchanged", which is knowable. For a fetch it
    // means "we did not look", which is not.
    expect(adapterFor(def()).capabilities.baselineFromLastKnown).toBe(true);
    expect(adapterFor(def({ source: 'json', urlTemplate: 'https://x/{handle}' }))
      .capabilities.baselineFromLastKnown).toBe(false);
  });

  it('takes countsTowardTotal from the descriptor, not a default', () => {
    // Only the user knows whether their sheet is a curated list of LeetCode problems.
    expect(adapterFor(def({ countsTowardTotal: false })).capabilities.countsTowardTotal).toBe(false);
    expect(adapterFor(def({ countsTowardTotal: true })).capabilities.countsTowardTotal).toBe(true);
  });

  it('carries the descriptor’s identity through unchanged', () => {
    const adapter = adapterFor(def());
    expect(adapter.id).toBe('custom:striver-sde-sheet-7f3a');
    expect(adapter.displayName).toBe('Striver SDE Sheet');
    expect(adapter.accent).toBe('#7c5cff');
  });

  it('offers no profile link unless the descriptor declares one', () => {
    expect(adapterFor(def()).profileUrl).toBeUndefined();
  });

  it('url-encodes the handle it substitutes', () => {
    const adapter = adapterFor(
      def({ profileUrlTemplate: 'https://example.com/u/{handle}/stats' }),
    );
    expect(adapter.profileUrl?.('a b/c')).toBe('https://example.com/u/a%20b%2Fc/stats');
  });

  it('links even with no handle, which is the whole point for a counter', () => {
    // A sheet has a URL but no account. The old `handle && profileUrl` guard in the
    // card components made this unreachable.
    const adapter = adapterFor(def({ profileUrlTemplate: 'https://takeuforward.org/sheet' }));
    expect(adapter.profileUrl?.('')).toBe('https://takeuforward.org/sheet');
  });
});

describe('adapterFor — json and scrape, before their phases land', () => {
  it('rejects rather than resolving zeros', async () => {
    // These can only arrive through an imported file today. A zero would read as lost
    // progress and would quietly drag down the cross-platform total; an error is
    // visible and blames the right thing.
    const adapter = adapterFor(
      def({ source: 'json', urlTemplate: 'https://kenkoooo.com/x?user={handle}' }),
    );
    await expect(adapter.fetchStats('tourist', new AbortController().signal)).rejects.toThrow(
      /newer version/,
    );
  });

  it('still expects to be fetched, so it is never mistaken for a counter', () => {
    const { capabilities } = adapterFor(
      def({ source: 'scrape', urlTemplate: 'https://example.com/{handle}' }),
    );
    expect(capabilities.fetchable).toBe(true);
    expect(capabilities.requiresHandle).toBe(true);
  });
});

describe('manualStats', () => {
  it('puts the count where every existing consumer already reads it', () => {
    // solved.total is what appendHistory, Delta, Sparkline, solvedToday, the badge and
    // the reminder all use. Anywhere else and each of them needs new code.
    const stats = manualStats(def(), 45, 1_700_000_000_000);
    expect(stats.solved).toEqual({ total: 45 });
    expect(stats.headline).toEqual([{ label: 'Solved', value: 45, delta: 'solved' }]);
    expect(stats.platform).toBe('custom:striver-sde-sheet-7f3a');
  });

  it('reports an empty handle, which is what disarms the account-identity guard', () => {
    expect(manualStats(def(), 0, 0).handle).toBe('');
  });

  it('keeps the target out of the headline', () => {
    // "45 of 191" is one control, not two statistics. ManualCounter renders the target
    // from the descriptor; a second StatBlock would just be a duplicate number.
    const stats = manualStats(def({ target: 191 }), 45, 0);
    expect(stats.headline).toHaveLength(1);
  });
});

describe('clampCount', () => {
  it('never goes negative', () => {
    // A misclick on "−" at zero must do nothing, not invent negative progress.
    expect(clampCount(-1)).toBe(0);
    expect(clampCount(-999)).toBe(0);
  });

  it('rounds, caps and refuses nonsense', () => {
    expect(clampCount(45.6)).toBe(46);
    expect(clampCount(1e12)).toBe(MAX_MANUAL_COUNT);
    expect(clampCount(Number.NaN)).toBe(0);
    expect(clampCount(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('customAdapters', () => {
  it('preserves descriptor order, since that is the default display order', () => {
    const ids = customAdapters([
      def({ id: 'custom:a-0001' }),
      def({ id: 'custom:b-0002' }),
    ]).map((adapter) => adapter.id);
    expect(ids).toEqual(['custom:a-0001', 'custom:b-0002']);
  });
});

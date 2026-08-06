import { describe, expect, it } from 'vitest';
import { ADAPTERS, orderedAdapters } from './registry';
import { PLATFORM_IDS } from './types';

const REGISTRY_ORDER = ADAPTERS.map((adapter) => adapter.id);

describe('orderedAdapters', () => {
  it('falls back to registry order when nothing is saved', () => {
    expect(orderedAdapters([]).map((a) => a.id)).toEqual(REGISTRY_ORDER);
  });

  it('honours a full saved order', () => {
    const reversed = [...REGISTRY_ORDER].reverse();
    expect(orderedAdapters(reversed).map((a) => a.id)).toEqual(reversed);
  });

  it('appends platforms missing from the saved order instead of dropping them', () => {
    // A saved order predating a newly added platform must not make it disappear.
    const partial = ['codechef', 'leetcode'] as const;
    const result = orderedAdapters(partial).map((a) => a.id);

    expect(result.slice(0, 2)).toEqual(['codechef', 'leetcode']);
    expect(result).toHaveLength(PLATFORM_IDS.length);
    expect(new Set(result)).toEqual(new Set(PLATFORM_IDS));
  });

  it('ignores duplicates in the saved order', () => {
    const result = orderedAdapters(['leetcode', 'leetcode', 'codechef']).map((a) => a.id);
    expect(result).toHaveLength(PLATFORM_IDS.length);
    expect(result.filter((id) => id === 'leetcode')).toHaveLength(1);
  });
});

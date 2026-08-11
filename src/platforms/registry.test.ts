import { describe, expect, it } from 'vitest';
import { BUILTIN_ADAPTERS, allAdapters, getAdapter, orderedAdapters } from './registry';
import { BUILTIN_PLATFORM_IDS, FETCHED_PLATFORM, type PlatformAdapter } from './types';

const REGISTRY_ORDER = BUILTIN_ADAPTERS.map((adapter) => adapter.id);

function custom(id: string): PlatformAdapter {
  return {
    id,
    displayName: id,
    accent: '#123456',
    capabilities: { ...FETCHED_PLATFORM, fetchable: false, requiresHandle: false },
    fetchStats: () => Promise.reject(new Error('not used')),
  };
}

describe('BUILTIN_ADAPTERS', () => {
  it('registers exactly the declared builtin ids', () => {
    // PlatformId widened to `string`, so the compiler no longer proves that
    // leetcode.id === 'leetcode'. This test reinstates that guarantee.
    expect([...REGISTRY_ORDER].sort()).toEqual([...BUILTIN_PLATFORM_IDS].sort());
  });

  it('gives every builtin a complete capability set', () => {
    for (const adapter of BUILTIN_ADAPTERS) {
      expect(Object.keys(adapter.capabilities).sort()).toEqual(
        Object.keys(FETCHED_PLATFORM).sort(),
      );
    }
  });

  it('matches the allowlists the capabilities replaced', () => {
    // Proves the refactor is behaviour-preserving: these were RATING_SLOTS and
    // PROBLEM_LIST_PLATFORMS before they became declared capabilities.
    const withCap = (key: 'rating' | 'problemList' | 'calendar') =>
      BUILTIN_ADAPTERS.filter((a) => a.capabilities[key]).map((a) => a.id).sort();

    expect(withCap('rating')).toEqual(['codechef', 'codeforces', 'leetcode']);
    expect(withCap('problemList')).toEqual(['codeforces', 'leetcode']);
    expect(withCap('calendar')).toEqual(['leetcode']);
  });
});

describe('orderedAdapters', () => {
  it('falls back to registry order when nothing is saved', () => {
    expect(orderedAdapters([], []).map((a) => a.id)).toEqual(REGISTRY_ORDER);
  });

  it('honours a full saved order', () => {
    const reversed = [...REGISTRY_ORDER].reverse();
    expect(orderedAdapters(reversed, []).map((a) => a.id)).toEqual(reversed);
  });

  it('appends platforms missing from the saved order instead of dropping them', () => {
    // A saved order predating a newly added platform must not make it disappear.
    const result = orderedAdapters(['codechef', 'leetcode'], []).map((a) => a.id);

    expect(result.slice(0, 2)).toEqual(['codechef', 'leetcode']);
    expect(new Set(result)).toEqual(new Set(BUILTIN_PLATFORM_IDS));
  });

  it('ignores duplicates in the saved order', () => {
    const result = orderedAdapters(['leetcode', 'leetcode', 'codechef'], []).map((a) => a.id);
    expect(result).toHaveLength(BUILTIN_PLATFORM_IDS.length);
    expect(result.filter((id) => id === 'leetcode')).toHaveLength(1);
  });

  it('includes custom platforms, defaulting them after the builtins', () => {
    const mine = custom('custom:striver-7f3a');
    const result = orderedAdapters([], [mine]).map((a) => a.id);
    expect(result).toEqual([...REGISTRY_ORDER, 'custom:striver-7f3a']);
  });

  it('lets a custom platform be reordered ahead of the builtins', () => {
    const mine = custom('custom:striver-7f3a');
    const result = orderedAdapters(['custom:striver-7f3a'], [mine]).map((a) => a.id);
    expect(result[0]).toBe('custom:striver-7f3a');
  });

  it('survives an order naming a custom platform that no longer exists', () => {
    expect(orderedAdapters(['custom:deleted-0000'], []).map((a) => a.id)).toEqual(REGISTRY_ORDER);
  });
});

describe('getAdapter', () => {
  it('finds builtins and custom platforms alike', () => {
    const mine = custom('custom:striver-7f3a');
    expect(getAdapter('leetcode', [])?.displayName).toBe('LeetCode');
    expect(getAdapter('custom:striver-7f3a', [mine])).toBe(mine);
    expect(getAdapter('custom:striver-7f3a', [])).toBeUndefined();
    expect(getAdapter('nope', [])).toBeUndefined();
  });
});

describe('allAdapters', () => {
  it('puts builtins first so their chart slots are stable', () => {
    const result = allAdapters([custom('custom:a-0001')]);
    expect(result).toHaveLength(BUILTIN_ADAPTERS.length + 1);
    expect(result.slice(0, BUILTIN_ADAPTERS.length)).toEqual(BUILTIN_ADAPTERS);
  });
});

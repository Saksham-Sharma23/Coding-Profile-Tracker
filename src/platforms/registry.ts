import { codechef } from './codechef';
import { codeforces } from './codeforces';
import { geeksforgeeks } from './geeksforgeeks';
import { hackerrank } from './hackerrank';
import { leetcode } from './leetcode';
import type { PlatformAdapter, PlatformId } from './types';

/**
 * The single place a new platform gets registered. Order here is the default display
 * order, used until the user reorders them.
 */
export const ADAPTERS: PlatformAdapter[] = [
  leetcode,
  codeforces,
  hackerrank,
  codechef,
  geeksforgeeks,
];

const BY_ID = new Map<PlatformId, PlatformAdapter>(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(id: PlatformId): PlatformAdapter | undefined {
  return BY_ID.get(id);
}

export function isSupported(id: PlatformId): boolean {
  return BY_ID.has(id);
}

/**
 * Adapters in the user's saved order. Anything absent from `order` keeps its registry
 * position at the end rather than disappearing — so a platform added in a later
 * release still shows up for users whose saved order predates it.
 */
export function orderedAdapters(order: readonly PlatformId[]): PlatformAdapter[] {
  const seen = new Set<PlatformId>();
  const ranked: PlatformAdapter[] = [];

  for (const id of order) {
    const adapter = BY_ID.get(id);
    if (adapter && !seen.has(id)) {
      seen.add(id);
      ranked.push(adapter);
    }
  }

  return [...ranked, ...ADAPTERS.filter((adapter) => !seen.has(adapter.id))];
}

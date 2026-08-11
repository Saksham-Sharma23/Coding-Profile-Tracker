import { codechef } from './codechef';
import { codeforces } from './codeforces';
import { geeksforgeeks } from './geeksforgeeks';
import { hackerrank } from './hackerrank';
import { leetcode } from './leetcode';
import type { PlatformAdapter, PlatformId } from './types';

/**
 * The single place a new built-in platform gets registered. Order here is the default
 * display order, used until the user reorders them.
 */
export const BUILTIN_ADAPTERS: PlatformAdapter[] = [
  leetcode,
  codeforces,
  hackerrank,
  codechef,
  geeksforgeeks,
];

/**
 * Built-ins plus the user's own platforms, which are built fresh from their stored
 * descriptors on every call.
 *
 * `custom` is a required parameter rather than one defaulting to `[]` on purpose: a
 * default would let a call site that forgot to pass it silently drop every custom
 * platform, which is exactly this feature's characteristic bug. Making it required
 * turns that into a compile error. Building ~10 closures per call is free at this
 * scale, and the service worker is torn down every ~30s so a module-scope cache would
 * buy nothing anyway.
 */
export function allAdapters(custom: readonly PlatformAdapter[]): PlatformAdapter[] {
  return [...BUILTIN_ADAPTERS, ...custom];
}

export function getAdapter(
  id: PlatformId,
  custom: readonly PlatformAdapter[],
): PlatformAdapter | undefined {
  return allAdapters(custom).find((adapter) => adapter.id === id);
}

export function isSupported(id: PlatformId, custom: readonly PlatformAdapter[]): boolean {
  return getAdapter(id, custom) !== undefined;
}

/**
 * Adapters in the user's saved order. Anything absent from `order` keeps its registry
 * position at the end rather than disappearing — so a platform added in a later
 * release, or one the user just created, still shows up.
 */
export function orderedAdapters(
  order: readonly PlatformId[],
  custom: readonly PlatformAdapter[],
): PlatformAdapter[] {
  const all = allAdapters(custom);
  const byId = new Map(all.map((adapter) => [adapter.id, adapter]));

  const seen = new Set<PlatformId>();
  const ranked: PlatformAdapter[] = [];

  for (const id of order) {
    const adapter = byId.get(id);
    if (adapter && !seen.has(id)) {
      seen.add(id);
      ranked.push(adapter);
    }
  }

  return [...ranked, ...all.filter((adapter) => !seen.has(adapter.id))];
}

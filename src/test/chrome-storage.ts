/**
 * Minimal in-memory `chrome.storage.local`, which is all `storage/repo.ts` touches.
 *
 * Exists so tests can exercise the real `saveSettings` / `recordSuccess` /
 * `recordManual` chokepoints end to end rather than only the pure helpers around them —
 * the bugs this repo has actually shipped lived in those chokepoints, not in the
 * helpers. Call it from `beforeEach`; each call starts from an empty bag.
 */
export function mockChromeStorage(): void {
  const bag: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: bag[key] }),
        set: async (patch: Record<string, unknown>) => void Object.assign(bag, patch),
      },
    },
  };
}

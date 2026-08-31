/**
 * Minimal in-memory Chrome API surface — enough for `storage/repo.ts` and for the UI
 * surfaces that read tabs or drive the toolbar icon.
 *
 * Exists so tests can exercise the real `saveSettings` / `recordSuccess` /
 * `recordManual` chokepoints end to end rather than only the pure helpers around them —
 * the bugs this repo has actually shipped lived in those chokepoints, not in the
 * helpers. Call it from `beforeEach`; each call starts from an empty bag.
 *
 * Returns the stub object so a test can reach in and assert on it, or replace one
 * method with a spy.
 */
export interface ChromeStub {
  chrome: Record<string, unknown>;
  /** The active tab reported by chrome.tabs.query. Assign to change what a test sees. */
  activeTab: { url?: string; windowId?: number; id?: number };
  /** Listeners registered on tabs.onActivated / onUpdated, so a test can fire them. */
  tabListeners: (() => void)[];
}

/**
 * Options for `mockChromeStorage`.
 */
export interface StubOptions {
  /**
   * Delay in ms applied to every get and set, modelling the real IPC round-trip.
   *
   * Defaults to 0, which is fine for tests that never overlap two writes. Pass a small
   * value to exercise concurrency: with a synchronous stub, a read-modify-write cycle can
   * never interleave, so a lost-update bug is structurally invisible — which is exactly
   * how one shipped. See `repo.concurrency.test.ts`.
   */
  latencyMs?: number;
}

export function mockChromeStorage(options: StubOptions = {}): ChromeStub {
  const bag: Record<string, unknown> = {};
  const { latencyMs = 0 } = options;
  const tick = () =>
    latencyMs > 0 ? new Promise((resolve) => setTimeout(resolve, latencyMs)) : undefined;
  const stub: ChromeStub = {
    chrome: {},
    activeTab: { url: undefined, windowId: 1, id: 1 },
    tabListeners: [],
  };

  const listener = {
    addListener: (fn: () => void) => stub.tabListeners.push(fn),
    removeListener: (fn: () => void) => {
      const at = stub.tabListeners.indexOf(fn);
      if (at >= 0) stub.tabListeners.splice(at, 1);
    },
  };

  stub.chrome = {
    storage: {
      local: {
        get: async (key: string) => {
          await tick();
          return { [key]: bag[key] };
        },
        set: async (patch: Record<string, unknown>) => {
          await tick();
          Object.assign(bag, patch);
        },
      },
      // useTracker subscribes on mount so every open surface stays in step. Nothing in
      // these tests writes from a second surface, so the listeners are never called.
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      openOptionsPage: async () => {},
      sendMessage: async () => ({ type: 'ack' }),
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    tabs: {
      query: async () => [stub.activeTab],
      create: async () => {},
      onActivated: listener,
      onUpdated: listener,
    },
    action: { setPopup: async () => {} },
    sidePanel: { setPanelBehavior: async () => {}, open: async () => {} },
  };

  (globalThis as unknown as { chrome: unknown }).chrome = stub.chrome;
  return stub;
}

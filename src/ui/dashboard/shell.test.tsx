// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customAdapters } from '@/platforms/custom/adapter';
import { BUILTIN_ADAPTERS } from '@/platforms/registry';
import type { PlatformAdapter } from '@/platforms/types';
import { defaultState, type TrackerState } from '@/storage/schema';
import { mockChromeStorage } from '@/test/chrome-storage';
import { Dashboard } from './Dashboard';
import { Sidebar } from './Sidebar';
import { useHashView, type View } from './useHashView';

const leetcode = BUILTIN_ADAPTERS.find((a) => a.id === 'leetcode')!;
const codeforces = BUILTIN_ADAPTERS.find((a) => a.id === 'codeforces')!;

function render(node: React.ReactElement): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { root, host };
}

/* ---- useHashView -------------------------------------------------------- */

/** Probe that surfaces the hook's value and exposes its setter as a button. */
function Probe({ initial }: { initial?: View }) {
  const [view, go] = useHashView(initial);
  const [target, setTarget] = useState<View>('problems');
  return (
    <>
      <span data-testid="view">{view}</span>
      <button onClick={() => go(target)}>go</button>
      <button onClick={() => setTarget('platforms')}>retarget</button>
    </>
  );
}

describe('useHashView', () => {
  beforeEach(() => {
    mockChromeStorage();
    window.location.hash = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  const shown = (host: HTMLElement) => host.querySelector('[data-testid="view"]')?.textContent;

  it('defaults to overview with no hash', () => {
    const { host } = render(<Probe />);
    expect(shown(host)).toBe('overview');
  });

  it('opens on the initial view the entry point asks for', () => {
    // This is how chrome.runtime.openOptionsPage() lands on Settings inside the shell.
    const { host } = render(<Probe initial="settings" />);
    expect(shown(host)).toBe('settings');
  });

  it('lets an explicit hash beat the initial view', () => {
    // Otherwise a bookmark to #problems would be overridden by whichever entry point
    // happened to open it.
    window.location.hash = '#problems';
    const { host } = render(<Probe initial="settings" />);
    expect(shown(host)).toBe('problems');
  });

  it('falls back rather than showing a blank page for a junk hash', () => {
    window.location.hash = '#not-a-view';
    const { host } = render(<Probe initial="settings" />);
    expect(shown(host)).toBe('settings');
  });

  it('follows the back button', () => {
    const { host } = render(<Probe />);
    act(() => {
      window.location.hash = '#platforms';
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(shown(host)).toBe('platforms');
  });

  it('writes the hash when navigating, so a reload stays put', () => {
    const { host } = render(<Probe />);
    act(() => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(shown(host)).toBe('problems');
    expect(window.location.hash).toBe('#problems');
  });

  it('updates state directly, not by waiting for the event', () => {
    /*
     * Assigning a hash identical to the current one fires no hashchange at all. Relying
     * on the event would silently drop a click on the view you are already in — which
     * matters, because the shell also uses that click to move focus to the heading.
     */
    window.location.hash = '#problems';
    const { host } = render(<Probe />);
    const spy = vi.fn();
    window.addEventListener('hashchange', spy);

    act(() => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(shown(host)).toBe('problems');
    window.removeEventListener('hashchange', spy);
  });
});

/* ---- Sidebar ------------------------------------------------------------ */

function stateWith(parts: Partial<TrackerState['snapshots']> = {}): TrackerState {
  const state = defaultState();
  state.snapshots = parts;
  return state;
}

const markup = (node: React.ReactElement) => renderToStaticMarkup(node);

function sidebar(tracked: PlatformAdapter[], state: TrackerState, view: View = 'overview') {
  return markup(
    <Sidebar
      state={state}
      tracked={tracked}
      view={view}
      onNavigate={() => {}}
      refreshing={false}
      onRefresh={() => {}}
    />,
  );
}

describe('Sidebar', () => {
  it('marks exactly the active destination with aria-current', () => {
    const html = sidebar([], defaultState(), 'problems');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    // The attribute sits on the item whose label is Problems.
    expect(html).toMatch(/aria-current="page"[^>]*>.*?Problems/s);
  });

  it('flags a failing platform, from every view including Settings', () => {
    /*
     * The rail's reason to exist beyond navigation. A broken platform used to be
     * visible only by scrolling to its card, so the settings page could sit open
     * indefinitely beside a platform that had been erroring for a week.
     */
    const state = stateWith({
      leetcode: { status: 'ok', fetchedAt: Date.now(), stats: undefined },
      codeforces: { status: 'error', error: 'boom', fetchedAt: 0 },
    });

    const html = sidebar([leetcode, codeforces], state, 'settings');
    expect(html).toContain('rail-platform-alert');
    expect(html.match(/rail-platform-alert/g)).toHaveLength(1);
  });

  it('shows each platform’s headline number when it is healthy', () => {
    const state = stateWith({
      leetcode: {
        status: 'ok',
        fetchedAt: Date.now(),
        stats: {
          platform: 'leetcode',
          handle: 'neal_wu',
          fetchedAt: 0,
          headline: [{ label: 'Solved', value: 1284, delta: 'solved' }],
        },
      },
    });

    expect(sidebar([leetcode], state)).toContain('1,284');
  });

  it('does not date the page from a hand-kept counter', () => {
    /*
     * A manual snapshot stamps fetchedAt with the moment the user clicked +1. Counting
     * it here would make the rail claim "Fetched just now" when nothing was fetched at
     * all — the same class of bug as isStale.
     */
    const state = stateWith({
      'custom:striver-7f3a': { status: 'ok', fetchedAt: Date.now(), manual: true },
    });
    const striver = customAdapters([
      {
        id: 'custom:striver-7f3a',
        displayName: 'Striver SDE Sheet',
        accent: '#7c5cff',
        source: 'manual',
        countsTowardTotal: false,
        chartRating: false,
      },
    ])[0]!;

    expect(sidebar([striver], state)).toContain('Fetched never');
  });

  it('omits the tracking list entirely when nothing is tracked', () => {
    expect(sidebar([], defaultState())).not.toContain('rail-platforms');
  });
});

/* ---- the shell ---------------------------------------------------------- */

describe('Dashboard shell', () => {
  beforeEach(() => {
    mockChromeStorage();
    window.location.hash = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  /** Renders and lets useTracker's initial readState settle. */
  async function mount(node: React.ReactElement) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(node);
    });
    return host;
  }

  const titles = (host: HTMLElement) =>
    [...host.querySelectorAll('.view-title')].map((el) => el.textContent);

  it('shows exactly one view at a time', async () => {
    // The whole point of switching views rather than stacking sections: the reader is
    // never scrolling past three things to reach the fourth.
    const host = await mount(<Dashboard />);
    expect(titles(host)).toHaveLength(1);
  });

  it('opens on Settings from the options entry point', async () => {
    // chrome.runtime.openOptionsPage() renders this same component with initialView.
    const host = await mount(<Dashboard initialView="settings" />);
    expect(titles(host)).toEqual(['Settings']);
  });

  it('keeps the rail present on the settings view', async () => {
    // Settings used to be a separate page with no navigation and no sight of whether
    // anything was broken.
    const host = await mount(<Dashboard initialView="settings" />);
    expect(host.querySelector('.rail')).not.toBeNull();
  });

  it('switches views from the rail, and moves focus to the new heading', async () => {
    const host = await mount(<Dashboard />);

    const problems = [...host.querySelectorAll('.rail-item')].find((el) =>
      el.textContent?.includes('Problems'),
    )!;
    await act(async () => {
      problems.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(titles(host)).toHaveLength(1);
    expect(window.location.hash).toBe('#problems');
    // Otherwise the whole main column is replaced while focus sits on a rail button
    // that did not change, and a screen reader announces nothing at all.
    expect(document.activeElement?.className).toContain('view-title');
  });

  it('offers a route out of an empty state rather than a dead end', async () => {
    const host = await mount(<Dashboard />);
    expect(host.textContent).toContain('Nothing tracked yet');
    expect(host.textContent).toContain('Set up your platforms');
  });
});

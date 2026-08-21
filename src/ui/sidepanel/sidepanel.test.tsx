// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_ADAPTERS } from '@/platforms/registry';
import { readState, saveSettings, updateState } from '@/storage/repo';
import { mockChromeStorage, type ChromeStub } from '@/test/chrome-storage';
import { SidePanel, surfaceFirst } from './SidePanel';

const leetcode = BUILTIN_ADAPTERS.find((a) => a.id === 'leetcode')!;
const codeforces = BUILTIN_ADAPTERS.find((a) => a.id === 'codeforces')!;
const codechef = BUILTIN_ADAPTERS.find((a) => a.id === 'codechef')!;

let stub: ChromeStub;

beforeEach(() => {
  stub = mockChromeStorage();
});

afterEach(() => {
  document.body.innerHTML = '';
});

/** Renders the panel and lets useTracker's initial read settle. */
async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<SidePanel />);
  });
  return host;
}

/** Seeds three tracked platforms in a known order. */
async function seed() {
  await saveSettings({
    handles: { leetcode: 'neal_wu', codeforces: 'tourist', codechef: 'gennady.korotkevich' },
    order: ['leetcode', 'codeforces', 'codechef'],
  });
}

const rowNames = (host: HTMLElement) =>
  [...host.querySelectorAll('.prow-name')].map((el) => el.textContent);

const findButton = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('button')].find(
    (el) => el.getAttribute('aria-label') === label || el.textContent?.trim() === label,
  );

describe('surfaceFirst', () => {
  const all = [leetcode, codeforces, codechef];

  it('moves the matched platform to the front, keeping the rest in order', () => {
    expect(surfaceFirst(all, 'codechef').map((a) => a.id)).toEqual([
      'codechef',
      'leetcode',
      'codeforces',
    ]);
  });

  it('returns the very same array when nothing matches', () => {
    // Reference equality, so the common case costs React nothing.
    expect(surfaceFirst(all, undefined)).toBe(all);
    expect(surfaceFirst(all, 'geeksforgeeks')).toBe(all);
    // Already first: also a no-op.
    expect(surfaceFirst(all, 'leetcode')).toBe(all);
  });
});

describe('SidePanel', () => {
  it('renders a row per tracked platform', async () => {
    await seed();
    const host = await mount();
    expect(rowNames(host)).toEqual(['LeetCode', 'Codeforces', 'CodeChef']);
  });

  it('surfaces the platform for the site in the current tab', async () => {
    await seed();
    stub.activeTab.url = 'https://www.codechef.com/problems/START01';
    const host = await mount();
    expect(rowNames(host)?.[0]).toBe('CodeChef');
  });

  it('never writes the surfaced order or expansion to storage', async () => {
    /*
     * The regression this test exists for. `settings.order` and `settings.expanded` are
     * also what the popup reads, so persisting a view-level emphasis would silently
     * rewrite the order the user chose in Settings — just by browsing.
     */
    await seed();
    stub.activeTab.url = 'https://www.codechef.com/users/tourist';
    await mount();

    const { settings } = await readState();
    expect(settings.order).toEqual(['leetcode', 'codeforces', 'codechef']);
    expect(settings.expanded).toEqual([]);
  });

  it('leaves the saved order alone on an unrelated site', async () => {
    await seed();
    stub.activeTab.url = 'https://example.com/';
    const host = await mount();
    expect(rowNames(host)).toEqual(['LeetCode', 'Codeforces', 'CodeChef']);
  });

  it('reveals nothing when Chrome withholds the tab URL', async () => {
    // What every non-granted host looks like without the `tabs` permission.
    await seed();
    stub.activeTab.url = undefined;
    const host = await mount();
    expect(rowNames(host)).toEqual(['LeetCode', 'Codeforces', 'CodeChef']);
  });

  it('does not re-open a row the user collapsed on the same site', async () => {
    /*
     * The auto-expand fires on a *change* of matched platform. A SPA rewrites its URL on
     * navigation, and re-applying on every tab event would fight anyone who collapsed
     * the row on purpose.
     */
    await seed();
    stub.activeTab.url = 'https://leetcode.com/problems/two-sum/';
    const host = await mount();

    const toggle = host.querySelector('.prow-head')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('.prow-head')!.getAttribute('aria-expanded')).toBe('false');

    // A tab event for the same site must not undo that.
    await act(async () => {
      stub.tabListeners.forEach((fire) => fire());
    });
    expect(host.querySelector('.prow-head')!.getAttribute('aria-expanded')).toBe('false');

    // And collapsing an auto-opened row must not have written to storage either.
    expect((await readState()).settings.expanded).toEqual([]);
  });

  it('opens settings in place without opening a tab', async () => {
    // The entire point of the panel: small changes must not cost a tab.
    await seed();
    const create = vi.fn(async () => {});
    (stub.chrome.tabs as { create: unknown }).create = create;

    const host = await mount();
    await act(async () => {
      findButton(host, 'Settings')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Daily goal');
    expect(create).not.toHaveBeenCalled();
  });

  it('offers a way in when nothing is tracked yet', async () => {
    const host = await mount();
    expect(host.textContent).toContain('Nothing tracked yet');

    await act(async () => {
      findButton(host, 'Add your usernames')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(host.textContent).toContain('Platforms');
  });

  it('shows a hand-kept counter alongside fetched platforms', async () => {
    await updateState((state) => {
      state.settings.handles = { leetcode: 'neal_wu' };
      state.settings.custom = [
        {
          id: 'custom:striver-7f3a',
          displayName: 'Striver SDE Sheet',
          accent: '#7c5cff',
          source: 'manual',
          target: 191,
          countsTowardTotal: false,
          chartRating: false,
        },
      ];
    });

    const host = await mount();
    expect(rowNames(host)).toContain('Striver SDE Sheet');
  });
});

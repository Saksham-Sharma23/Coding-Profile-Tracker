import { useEffect, useState } from 'react';
import { sidePanelSupported } from '@/background/icon-behavior';
import { isStale } from '@/background/scheduler';
import { customAdapters } from '@/platforms/custom/adapter';
import { orderedAdapters } from '@/platforms/registry';
import type { PlatformId } from '@/platforms/types';
import { isoDay } from '@/storage/repo';
import { ContestStrip } from '../components/ContestStrip';
import { PlatformRow } from '../components/PlatformRow';
import { RefreshIcon, SettingsIcon } from '../icons';
import { isExpanded, visiblePlatforms } from '@/shared/progress';
import { useThemeMirror, useTracker } from '../useTracker';
import { SummaryStrip } from '../components/SummaryStrip';
import './popup.css';

export function Popup() {
  const { state, loading, refreshing, refresh, updateSettings, counterFor } = useTracker();
  const today = isoDay(Date.now());

  useThemeMirror(state.settings.theme, loading);

  const tracked = visiblePlatforms(
    state,
    orderedAdapters(state.settings.order, customAdapters(state.settings.custom)),
  );

  // Refresh on open when the data has aged out, so the popup reflects reality without
  // the user pressing anything. Cached values render immediately meanwhile.
  useEffect(() => {
    if (loading || !tracked.length) return;
    void isStale().then((stale) => {
      if (stale) void refresh();
    });
    // Intentionally runs once, after the first load settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function toggle(id: PlatformId) {
    const open = state.settings.expanded;
    const next = open.includes(id) ? open.filter((each) => each !== id) : [...open, id];
    void updateSettings({ expanded: next });
  }

  const windowId = useCurrentWindowId();

  return (
    <div className="popup">
      <header className="row spread popup-header">
        <strong className="popup-title">Coding Tracker</strong>
        <div className="row popup-actions">
          <button
            className="btn-icon btn-ghost"
            onClick={() => void refresh()}
            disabled={refreshing || !tracked.length}
            aria-label="Refresh now"
            title="Refresh now"
          >
            <RefreshIcon className={refreshing ? 'spin' : undefined} />
          </button>
          <button
            className="btn-icon btn-ghost"
            onClick={() => void chrome.runtime.openOptionsPage()}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {loading ? (
        <Skeleton />
      ) : tracked.length === 0 ? (
        <div className="pad onboarding">
          <p>Nothing tracked yet.</p>
          <p className="muted">
            Add a username for any platform and this popup starts showing your progress.
          </p>
          <button className="btn-primary" onClick={() => void chrome.runtime.openOptionsPage()}>
            Add your usernames
          </button>
        </div>
      ) : (
        <div className="popup-scroll">
          <SummaryStrip state={state} tracked={tracked} today={today} />
          <ContestStrip state={state} tracked={tracked} />

          <div className="rows">
            {tracked.map((adapter) => (
              <PlatformRow
                key={adapter.id}
                adapter={adapter}
                handle={state.settings.handles[adapter.id]}
                counter={counterFor(adapter)}
                snapshot={state.snapshots[adapter.id]}
                history={state.history[adapter.id]}
                solvedProblems={state.solved[adapter.id]}
                today={today}
                busy={refreshing}
                open={isExpanded(state.settings.expanded, adapter.id)}
                onToggle={() => toggle(adapter.id)}
                onRetry={() => void refresh([adapter.id])}
              />
            ))}
          </div>
        </div>
      )}

      <footer className="row spread popup-footer">
        <div className="row popup-links">
          <button
            className="btn-ghost btn-quiet popup-link"
            onClick={() =>
              void chrome.tabs.create({
                url: chrome.runtime.getURL('src/ui/dashboard/index.html'),
              })
            }
          >
            Open dashboard
          </button>

          {windowId !== undefined && (
            <button
              className="btn-ghost btn-quiet popup-link"
              /*
               * `sidePanel.open()` needs a user gesture, and any `await` ahead of it
               * spends the gesture — so the windowId is resolved on mount and this
               * handler calls open() as its very first statement.
               */
              onClick={() => void chrome.sidePanel.open({ windowId })}
            >
              Open side panel
            </button>
          )}
        </div>
        <span className="muted">
          {tracked.length} {tracked.length === 1 ? 'platform' : 'platforms'}
        </span>
      </footer>
    </div>
  );
}

/**
 * The window this popup belongs to, resolved once on mount.
 *
 * Fetched ahead of time rather than inside the click handler because
 * `chrome.sidePanel.open()` requires a user gesture and an `await` in front of it
 * consumes that gesture — the call would reject. Undefined until it resolves, and on
 * browsers with no side panel at all, which is also what hides the button.
 */
function useCurrentWindowId(): number | undefined {
  const [windowId, setWindowId] = useState<number>();

  useEffect(() => {
    if (!sidePanelSupported()) return;
    let active = true;
    chrome.tabs
      .query({ active: true, currentWindow: true })
      // windowId is not one of the fields the `tabs` permission gates, so this needs no
      // extra permission.
      .then((tabs) => active && setWindowId(tabs[0]?.windowId))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return windowId;
}

/** Placeholder rows, so opening the popup does not flash a bare "Loading…". */
function Skeleton() {
  return (
    <div className="rows" aria-hidden="true">
      <div className="skeleton skeleton-strip" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}

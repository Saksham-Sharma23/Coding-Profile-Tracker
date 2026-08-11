import { useEffect } from 'react';
import { isStale } from '@/background/scheduler';
import { orderedAdapters } from '@/platforms/registry';
import type { PlatformId } from '@/platforms/types';
import { isoDay } from '@/storage/repo';
import { ContestStrip } from '../components/ContestStrip';
import { PlatformRow } from '../components/PlatformRow';
import { RefreshIcon, SettingsIcon } from '../icons';
import { isExpanded, visiblePlatforms } from '@/shared/progress';
import { useThemeMirror, useTracker } from '../useTracker';
import { SummaryStrip } from './SummaryStrip';
import './popup.css';

export function Popup() {
  const { state, loading, refreshing, refresh, updateSettings } = useTracker();
  const today = isoDay(Date.now());

  useThemeMirror(state.settings.theme, loading);

  const tracked = visiblePlatforms(state, orderedAdapters(state.settings.order, []));

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
        <span className="muted">
          {tracked.length} {tracked.length === 1 ? 'platform' : 'platforms'}
        </span>
      </footer>
    </div>
  );
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

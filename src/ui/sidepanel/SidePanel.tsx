import { useEffect, useMemo, useRef, useState } from 'react';
import { customAdapters } from '@/platforms/custom/adapter';
import { orderedAdapters } from '@/platforms/registry';
import type { PlatformAdapter, PlatformId } from '@/platforms/types';
import { isExpanded, visiblePlatforms } from '@/shared/progress';
import { isoDay } from '@/storage/repo';
import { ContestStrip } from '../components/ContestStrip';
import { PlatformRow } from '../components/PlatformRow';
import { SummaryStrip } from '../components/SummaryStrip';
import { AppearanceSection } from '../dashboard/settings/AppearanceSection';
import { GoalSection } from '../dashboard/settings/GoalSection';
import { PlatformsSection } from '../dashboard/settings/PlatformsSection';
import type { SectionProps } from '../dashboard/settings/types';
import { RefreshIcon, SettingsIcon } from '../icons';
import { useThemeMirror, useTracker } from '../useTracker';
import { useActivePlatform } from './useActivePlatform';
import '../dashboard/settings/settings.css';
import './sidepanel.css';

export function SidePanel() {
  const { state, loading, refreshing, refresh, updateSettings, counterFor } = useTracker();
  const [showSettings, setShowSettings] = useState(false);
  const [note, setNote] = useState('');
  const today = isoDay(Date.now());

  useThemeMirror(state.settings.theme, loading);

  const here = useActivePlatform();
  const tracked = visiblePlatforms(
    state,
    orderedAdapters(state.settings.order, customAdapters(state.settings.custom)),
  );

  /*
   * The platform for the current site floats to the top — but only in this component's
   * render. Writing it to settings.order would rewrite the order the user chose in
   * Settings, and the popup reads that same field, so browsing would silently reshuffle
   * a surface the user is not even looking at.
   */
  const ordered = useMemo(() => surfaceFirst(tracked, here), [tracked, here]);

  const { open, toggle } = useAutoExpand(state.settings.expanded, here, updateSettings);

  const flash = (message: string) => {
    setNote(message);
    setTimeout(() => setNote(''), 2500);
  };

  if (loading) return <Skeleton />;

  const sectionProps: SectionProps = { state, updateSettings, flash };

  return (
    <div className="panel">
      <header className="row spread panel-header">
        <strong className="panel-title">Coding Tracker</strong>
        <div className="row panel-actions">
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
            className={showSettings ? 'btn-icon btn-ghost active' : 'btn-icon btn-ghost'}
            aria-pressed={showSettings}
            aria-label={showSettings ? 'Back to progress' : 'Settings'}
            title={showSettings ? 'Back to progress' : 'Settings'}
            // Toggles in place. Opening a tab from here is the friction the panel exists
            // to remove.
            onClick={() => setShowSettings((on) => !on)}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div className="panel-scroll">
        {showSettings ? (
          <div className="options panel-settings">
            <PlatformsSection {...sectionProps} />
            {note && (
              <p className="ok-text options-note" role="status">
                {note}
              </p>
            )}
            <GoalSection {...sectionProps} />
            <AppearanceSection {...sectionProps} />

            <p className="muted hint panel-more">
              Reminders, your own platforms, and import or export live in the full
              settings.
            </p>
            <button className="btn-quiet" onClick={() => openDashboard('settings')}>
              Open full settings
            </button>
          </div>
        ) : tracked.length === 0 ? (
          <div className="pad panel-empty">
            <p>Nothing tracked yet.</p>
            <p className="muted">
              Add a username for any platform, or a counter you keep by hand, and it shows
              up here.
            </p>
            <button className="btn-primary" onClick={() => setShowSettings(true)}>
              Add your usernames
            </button>
          </div>
        ) : (
          <>
            <SummaryStrip state={state} tracked={tracked} today={today} />
            <ContestStrip state={state} tracked={tracked} />

            <div className="rows">
              {ordered.map((adapter) => (
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
                  open={open(adapter.id)}
                  onToggle={() => toggle(adapter.id)}
                  onRetry={() => void refresh([adapter.id])}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="row spread panel-footer">
        <button className="btn-ghost btn-quiet" onClick={() => openDashboard()}>
          Open dashboard
        </button>
        <span className="muted">
          {tracked.length} {tracked.length === 1 ? 'platform' : 'platforms'}
        </span>
      </footer>
    </div>
  );
}

/**
 * Moves the platform for the current site to the front, leaving every other platform in
 * the user's saved order.
 *
 * Returns the original array when nothing matches, so React sees the same reference and
 * the common case costs nothing.
 */
export function surfaceFirst(
  tracked: PlatformAdapter[],
  here: PlatformId | undefined,
): PlatformAdapter[] {
  if (!here) return tracked;
  const at = tracked.findIndex((adapter) => adapter.id === here);
  if (at <= 0) return tracked;
  return [tracked[at]!, ...tracked.slice(0, at), ...tracked.slice(at + 1)];
}

/**
 * Row expansion, with the platform for the current site opened automatically.
 *
 * Two rules keep this from fighting the user:
 *
 * 1. It fires only when the *matched platform changes*, not on every tab event. A URL
 *    changes on every keystroke in some SPAs, and re-applying would re-open a row the
 *    user just collapsed.
 * 2. The auto-opened row is local state, never written to `settings.expanded`. That
 *    field is the popup's memory too, and browsing should not rewrite it.
 */
function useAutoExpand(
  expanded: PlatformId[],
  here: PlatformId | undefined,
  updateSettings: (partial: { expanded: PlatformId[] }) => Promise<void>,
) {
  const [auto, setAuto] = useState<PlatformId>();
  const [dismissed, setDismissed] = useState<PlatformId>();
  const last = useRef<PlatformId>();

  useEffect(() => {
    if (here === last.current) return;
    last.current = here;
    setAuto(here);
    // A new site is a fresh chance to be helpful, so an earlier dismissal is forgotten.
    setDismissed(undefined);
  }, [here]);

  const open = (id: PlatformId) =>
    (auto === id && dismissed !== id) || isExpanded(expanded, id);

  const toggle = (id: PlatformId) => {
    // Collapsing an auto-opened row is remembered here rather than in storage: the row
    // was never in `expanded`, so removing it from `expanded` would do nothing.
    if (auto === id && dismissed !== id && !isExpanded(expanded, id)) {
      setDismissed(id);
      return;
    }
    const next = expanded.includes(id)
      ? expanded.filter((each) => each !== id)
      : [...expanded, id];
    void updateSettings({ expanded: next });
  };

  return { open, toggle };
}

function openDashboard(hash = ''): void {
  void chrome.tabs.create({
    url: chrome.runtime.getURL(`src/ui/dashboard/index.html${hash && `#${hash}`}`),
  });
}

/** Placeholder rows, so opening the panel does not flash a bare "Loading…". */
function Skeleton() {
  return (
    <div className="panel" aria-hidden="true">
      <div className="rows panel-skeleton">
        <div className="skeleton skeleton-strip" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-row" />
        ))}
      </div>
    </div>
  );
}

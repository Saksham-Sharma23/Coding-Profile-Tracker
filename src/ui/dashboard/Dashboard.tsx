import { useEffect, useRef } from 'react';
import { customAdapters } from '@/platforms/custom/adapter';
import { orderedAdapters } from '@/platforms/registry';
import { visiblePlatforms } from '@/shared/progress';
import { isoDay } from '@/storage/repo';
import { useThemeMirror, useTracker } from '../useTracker';
import { Sidebar, TabBar } from './Sidebar';
import { useHashView, type View } from './useHashView';
import { OverviewView } from './views/OverviewView';
import { PlatformsView } from './views/PlatformsView';
import { ProblemsView } from './views/ProblemsView';
import { SettingsView } from './views/SettingsView';
import './dashboard.css';

interface Props {
  /**
   * Which view to open when the URL names none. The options entry point passes
   * 'settings', which is how `chrome.runtime.openOptionsPage()` lands inside this same
   * app rather than on a separate page with no sidebar.
   */
  initialView?: View;
}

/**
 * The whole extension UI outside the popup: a persistent rail and one view at a time.
 *
 * Views rather than one long scroll, because all four areas matter and stacking them
 * meant the platform cards — the core data — sat below a chart, a heatmap and a
 * searchable table. A scroll-spy rail would have relabelled the same scroll, and left a
 * settings form stranded at the bottom of a data page.
 */
export function Dashboard({ initialView = 'overview' }: Props) {
  const { state, loading, refreshing, refresh, updateSettings, counterFor } = useTracker();
  const [view, go] = useHashView(initialView);
  const today = isoDay(Date.now());
  const heading = useRef<HTMLDivElement>(null);

  useThemeMirror(state.settings.theme, loading);

  const ordered = orderedAdapters(state.settings.order, customAdapters(state.settings.custom));
  const tracked = visiblePlatforms(state, ordered);

  /*
   * Switching a view replaces the whole main column, but focus stays on the rail button
   * that did it — so a screen reader announces nothing and a keyboard user has no idea
   * anything happened. Moving focus to the new heading is the announcement.
   *
   * Skipped on first paint: stealing focus from the document on load is its own bug.
   */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.querySelector<HTMLElement>('.view-title')?.focus();
  }, [view]);

  if (loading) return <Skeleton />;

  const empty = tracked.length === 0;

  return (
    <div className="shell">
      <Sidebar
        state={state}
        tracked={tracked}
        view={view}
        onNavigate={go}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />

      <div className="shell-main">
        <TabBar view={view} onNavigate={go} />

        <main className="view" ref={heading}>
          {view === 'settings' ? (
            <SettingsView state={state} updateSettings={updateSettings} />
          ) : empty ? (
            <Empty view={view} onNavigate={go} />
          ) : view === 'overview' ? (
            <OverviewView
              state={state}
              ordered={ordered}
              tracked={tracked}
              today={today}
              onNavigate={go}
            />
          ) : view === 'platforms' ? (
            <PlatformsView
              state={state}
              tracked={tracked}
              today={today}
              refreshing={refreshing}
              onRetry={(id) => void refresh([id])}
              counterFor={counterFor}
            />
          ) : (
            <ProblemsView state={state} tracked={tracked} today={today} />
          )}
        </main>
      </div>
    </div>
  );
}

/** Per-view empty state, so the CTA matches what the reader came here to see. */
function Empty({ view, onNavigate }: { view: View; onNavigate: (next: View) => void }) {
  const copy: Record<string, { title: string; body: string }> = {
    overview: {
      title: 'Nothing tracked yet',
      body: 'Add a username for any platform, or set up a counter you keep by hand, and your progress starts showing up here.',
    },
    platforms: {
      title: 'No platforms yet',
      body: 'Each platform you track gets a card here with its rating, solve count and trend.',
    },
    problems: {
      title: 'No problems recorded yet',
      body: 'Once a platform is tracked, every problem it reports lands in a searchable log here.',
    },
  };
  const { title, body } = copy[view] ?? copy.overview!;

  return (
    <>
      <h2 className="view-title" tabIndex={-1}>
        {title}
      </h2>
      <p className="muted view-empty">{body}</p>
      <button className="btn-primary" onClick={() => onNavigate('settings')}>
        Set up your platforms
      </button>
    </>
  );
}

/** Placeholder blocks, so the page does not flash a bare "Loading…". */
function Skeleton() {
  return (
    <div className="shell" aria-hidden="true">
      <div className="rail" />
      <div className="shell-main">
        <main className="view">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-band" />
          <div className="skeleton skeleton-chart" />
        </main>
      </div>
    </div>
  );
}

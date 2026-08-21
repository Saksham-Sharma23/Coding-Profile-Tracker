import { useMemo } from 'react';
import { customAdapters } from '@/platforms/custom/adapter';
import { orderedAdapters } from '@/platforms/registry';
import { formatCountdown, nextContest } from '@/shared/countdown';
import { bestStreak, solvedToday, totalSolved, visiblePlatforms } from '@/shared/progress';
import { isoDay } from '@/storage/repo';
import { ContestStrip } from '../components/ContestStrip';
import { PlatformCard } from '../components/PlatformCard';
import { Tile } from '../components/Tile';
import { RefreshIcon, SettingsIcon } from '../icons';
import { useThemeMirror, useTracker, timeAgo } from '../useTracker';
import { Heatmap } from '../viz/Heatmap';
import { RatingChart } from '../viz/RatingChart';
import type { Series } from '../viz/scales';
import { SolvedLog } from './SolvedLog';
import './dashboard.css';

/**
 * Only platforms declaring a true rating capability appear in the trend chart.
 * GeeksforGeeks is excluded because its "score" is a points total, not an Elo rating,
 * and plotting it on the same axis would misrepresent it.
 *
 * There are exactly three validated categorical slots, so the chart carries at most
 * three series. Colours are assigned by rank among ALL rating-capable platforms in
 * display order — not by position in the filtered list — so untracking one never
 * repaints the survivors.
 */
const CHART_SLOTS = ['--viz-1', '--viz-2', '--viz-3'];

export function Dashboard() {
  const { state, loading, refreshing, refresh, counterFor } = useTracker();
  const today = isoDay(Date.now());

  useThemeMirror(state.settings.theme, loading);

  const ordered = orderedAdapters(
    state.settings.order,
    customAdapters(state.settings.custom),
  );
  const tracked = visiblePlatforms(state, ordered);
  const trackedIds = new Set(tracked.map((adapter) => adapter.id));

  // Slots are claimed in display order across every rating-capable platform, tracked or
  // not, so a platform's colour never depends on which of its neighbours are visible.
  const ratedAll = ordered.filter((adapter) => adapter.capabilities.rating);
  const charted = ratedAll.slice(0, CHART_SLOTS.length).filter((a) => trackedIds.has(a.id));
  const omitted = ratedAll.length - CHART_SLOTS.length;

  const series = useMemo<Series[]>(
    () =>
      charted.map((adapter) => ({
        id: adapter.id,
        name: adapter.displayName,
        colorVar: CHART_SLOTS[ratedAll.indexOf(adapter)]!,
        points: (state.history[adapter.id] ?? [])
          .filter((point) => point.rating !== undefined)
          .map((point) => ({ d: point.d, v: point.rating! })),
      })),
    [state.history, state.settings.handles, state.settings.enabled, state.settings.order],
  );

  // First tracked platform that publishes a per-day calendar and actually has one.
  // Calendars are never merged across platforms — different denominators.
  const calendarSource = tracked.find(
    (adapter) =>
      adapter.capabilities.calendar && state.snapshots[adapter.id]?.stats?.activity?.calendar,
  );
  const calendar = calendarSource
    ? state.snapshots[calendarSource.id]?.stats?.activity?.calendar
    : undefined;

  const total = totalSolved(state, tracked);
  const { solved, partial } = solvedToday(state, tracked, today);
  const streak = bestStreak(state, tracked);
  const newest = Math.max(0, ...Object.values(state.snapshots).map((s) => s?.fetchedAt ?? 0));
  const contest = nextContest(state, tracked, Date.now());

  if (loading) return <p className="muted pad">Loading…</p>;

  return (
    <main className="dashboard">
      <header className="row spread dash-head">
        <h1>Coding Profile Tracker</h1>
        <div className="row">
          <button onClick={() => void refresh()} disabled={refreshing} className="dash-btn">
            <RefreshIcon size={14} className={refreshing ? 'spin' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className="btn-icon btn-ghost"
            onClick={() => void chrome.runtime.openOptionsPage()}
            aria-label="Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {tracked.length === 0 ? (
        <div className="pad">
          <p className="muted">Nothing tracked yet.</p>
          <button className="btn-primary" onClick={() => void chrome.runtime.openOptionsPage()}>
            Add your usernames
          </button>
        </div>
      ) : (
        <>
          <section className="totals">
            {/* The one hero figure on the page. */}
            <div className="tile surface hero-tile">
              <span className="hero-value">{total.toLocaleString()}</span>
              <span className="tile-label muted">Problems solved, all platforms</span>
            </div>
            <Tile
              label={partial ? 'Solved today (partial)' : 'Solved today'}
              value={solved === undefined ? '—' : solved.toLocaleString()}
            />
            <Tile
              label={streak ? `Streak · ${streak.source}` : 'Streak'}
              value={streak ? `${streak.days} days` : '—'}
            />
            <Tile
              label={contest ? 'Next contest' : 'Last updated'}
              value={contest ? formatCountdown(contest.startsAt - Date.now()) : timeAgo(newest)}
            />
          </section>

          <ContestStrip state={state} tracked={tracked} />

          <RatingChart series={series} />

          {omitted > 0 && (
            <p className="muted chart-note">
              Charting {CHART_SLOTS.length} of {ratedAll.length} rated platforms — the
              palette has {CHART_SLOTS.length} validated series slots, and reusing one
              would make two platforms indistinguishable.
            </p>
          )}

          {calendar && calendarSource && (
            <Heatmap calendar={calendar} today={today} sourceName={calendarSource.displayName} />
          )}

          <SolvedLog state={state} tracked={tracked} today={today} />

          <section className="grid">
            {tracked.map((adapter) => (
              <PlatformCard
                key={adapter.id}
                adapter={adapter}
                handle={state.settings.handles[adapter.id]}
                counter={counterFor(adapter)}
                snapshot={state.snapshots[adapter.id]}
                history={state.history[adapter.id]}
                today={today}
                busy={refreshing}
                onRetry={() => void refresh([adapter.id])}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}

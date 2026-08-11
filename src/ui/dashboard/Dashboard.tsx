import { useMemo } from 'react';
import { orderedAdapters } from '@/platforms/registry';
import type { PlatformId } from '@/platforms/types';
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
 * Only platforms whose number is a true rating appear in the trend chart, in a fixed
 * slot order. GeeksforGeeks is excluded on purpose: its "score" is a points total,
 * not an Elo rating, and plotting it on the same axis would misrepresent it.
 *
 * Colors are bound to the platform, never to its position in the filtered list, so
 * dropping a series never repaints the survivors.
 */
const RATING_SLOTS: { id: PlatformId; colorVar: string }[] = [
  { id: 'codeforces', colorVar: '--viz-1' },
  { id: 'leetcode', colorVar: '--viz-2' },
  { id: 'codechef', colorVar: '--viz-3' },
];

export function Dashboard() {
  const { state, loading, refreshing, refresh } = useTracker();
  const today = isoDay(Date.now());

  useThemeMirror(state.settings.theme, loading);

  const tracked = visiblePlatforms(state, orderedAdapters(state.settings.order));
  const trackedIds = new Set(tracked.map((adapter) => adapter.id));

  const series = useMemo<Series[]>(
    () =>
      RATING_SLOTS.filter((slot) => trackedIds.has(slot.id)).map((slot) => ({
        id: slot.id,
        name: tracked.find((a) => a.id === slot.id)?.displayName ?? slot.id,
        colorVar: slot.colorVar,
        points: (state.history[slot.id] ?? [])
          .filter((point) => point.rating !== undefined)
          .map((point) => ({ d: point.d, v: point.rating! })),
      })),
    [state.history, state.settings.handles, state.settings.enabled, state.settings.order],
  );

  // LeetCode is the only platform exposing a per-day submission calendar.
  const calendar = trackedIds.has('leetcode')
    ? state.snapshots.leetcode?.stats?.activity?.calendar
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

          {calendar && <Heatmap calendar={calendar} today={today} sourceName="LeetCode" />}

          <SolvedLog state={state} tracked={tracked} today={today} />

          <section className="grid">
            {tracked.map((adapter) => (
              <PlatformCard
                key={adapter.id}
                adapter={adapter}
                handle={state.settings.handles[adapter.id]!}
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

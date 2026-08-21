import { useMemo } from 'react';
import type { PlatformAdapter } from '@/platforms/types';
import { formatCountdown, nextContest } from '@/shared/countdown';
import { bestStreak, solvedToday, totalSolved } from '@/shared/progress';
import type { TrackerState } from '@/storage/schema';
import { ContestStrip } from '../../components/ContestStrip';
import { Tile } from '../../components/Tile';
import { FlameIcon } from '../../icons';
import { GoalRing } from '../../viz/GoalRing';
import { Heatmap } from '../../viz/Heatmap';
import { RatingChart } from '../../viz/RatingChart';
import type { Series } from '../../viz/scales';
import type { View } from '../useHashView';

/**
 * There are exactly three validated categorical slots, so the chart carries at most
 * three series. Colours are assigned by rank among ALL rating-capable platforms in
 * display order — not by position in the filtered list — so untracking one never
 * repaints the survivors.
 */
const CHART_SLOTS = ['--viz-1', '--viz-2', '--viz-3'];

interface Props {
  state: TrackerState;
  ordered: PlatformAdapter[];
  tracked: PlatformAdapter[];
  today: string;
  onNavigate: (next: View) => void;
}

export function OverviewView({ state, ordered, tracked, today, onNavigate }: Props) {
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
  const goal = state.settings.dailyGoal;
  const contest = nextContest(state, tracked, Date.now());

  // Named so the hero figure's footnote can say which platforms are left out, rather
  // than presenting a filtered number as if it covered everything.
  const excluded = tracked
    .filter((adapter) => !adapter.capabilities.countsTowardTotal)
    .map((adapter) => adapter.displayName);

  return (
    <>
      <h2 className="view-title" tabIndex={-1}>
        Overview
      </h2>

      <section className="today-band surface">
        <div className="today-main">
          {goal > 0 && solved !== undefined && <GoalRing done={solved} goal={goal} />}
          <div className="today-text">
            <span className="today-value num">{solved === undefined ? '—' : solved.toLocaleString()}</span>
            <span className="today-label muted">
              {solved === undefined
                ? 'today — needs a day of history first'
                : goal > 0
                  ? `of ${goal} today`
                  : 'solved today'}
            </span>
          </div>
        </div>

        <div className="today-side">
          {/* The one hero figure on the page. */}
          <div className="today-stat">
            <span className="hero-value">{total.toLocaleString()}</span>
            <span className="tile-label muted">
              Problems solved
              {excluded.length > 0 && (
                <span className="muted"> · not counting {excluded.join(', ')}</span>
              )}
            </span>
          </div>

          {streak && (
            <div className="today-stat">
              <span className="today-stat-value row">
                <FlameIcon size={14} />
                {streak.days}d
              </span>
              {/* Only some platforms publish a streak, so it is attributed rather than
                  presented as a cross-platform figure the tracker cannot compute. */}
              <span className="tile-label muted">streak · {streak.source}</span>
            </div>
          )}
        </div>

        {/*
          Says what is missing instead of shrinking it to a "(partial)" tag in a label.
          The word explains nothing on its own, and it sat where the reader was looking
          for a number.
        */}
        {partial && (
          <p className="muted today-note">
            Some platforms had no data for yesterday, so today&apos;s count is incomplete.
          </p>
        )}
      </section>

      <ContestStrip state={state} tracked={tracked} />

      <section className="trends">
        <RatingChart series={series} />
        {calendar && calendarSource && (
          <Heatmap calendar={calendar} today={today} sourceName={calendarSource.displayName} />
        )}
      </section>

      {omitted > 0 && (
        <p className="muted chart-note">
          Charting {CHART_SLOTS.length} of {ratedAll.length} rated platforms — the palette has{' '}
          {CHART_SLOTS.length} validated series slots, and reusing one would make two platforms
          indistinguishable.
        </p>
      )}

      <section className="totals">
        {contest && (
          <Tile label="Next contest" value={formatCountdown(contest.startsAt - Date.now())} />
        )}
        <Tile label="Platforms tracked" value={tracked.length} />
        <Tile
          label="Problems recorded"
          value={Object.values(state.solved).reduce((n, list) => n + (list?.length ?? 0), 0)}
        />
      </section>

      <button className="btn-quiet view-link" onClick={() => onNavigate('platforms')}>
        See every platform →
      </button>
    </>
  );
}

import type { PlatformAdapter } from '@/platforms/types';
import type { TrackerState } from '@/storage/schema';
import { FlameIcon } from '../icons';
import { bestStreak, solvedToday, totalSolved } from '@/shared/progress';
import { GoalRing } from '../viz/GoalRing';
import './SummaryStrip.css';

interface Props {
  state: TrackerState;
  tracked: PlatformAdapter[];
  today: string;
}

/**
 * The always-visible header: what you did today, what you have done in total, and the
 * streak — so the popup answers "where am I" before anything is expanded.
 */
export function SummaryStrip({ state, tracked, today }: Props) {
  const { solved, partial } = solvedToday(state, tracked, today);
  const goal = state.settings.dailyGoal;
  const streak = bestStreak(state, tracked);
  const total = totalSolved(state, tracked);

  const unmeasured = solved === undefined;

  return (
    <section className="summary surface">
      <div className="row summary-today">
        {goal > 0 && !unmeasured && <GoalRing done={solved} goal={goal} />}

        <div className="summary-today-text">
          <span className="summary-value num">{unmeasured ? '—' : solved.toLocaleString()}</span>
          <span className="summary-label muted">
            {unmeasured
              ? 'today — needs a day of history'
              : goal > 0
                ? `of ${goal} today`
                : 'solved today'}
          </span>
        </div>
      </div>

      <div className="summary-side">
        <div className="summary-stat">
          <span className="summary-side-value num">{total.toLocaleString()}</span>
          <span className="summary-label muted">solved overall</span>
        </div>

        {streak && (
          <div className="summary-stat">
            <span className="summary-side-value row summary-streak">
              <FlameIcon size={12} />
              {streak.days}d
            </span>
            {/* Only LeetCode and GFG publish a streak, so it is attributed rather than
                presented as a cross-platform figure the tracker cannot compute. */}
            <span className="summary-label muted">streak · {streak.source}</span>
          </div>
        )}
      </div>

      {goal > 0 && solved === 0 && (
        <p className="summary-nudge muted">Nothing solved yet today.</p>
      )}
      {partial && !unmeasured && (
        <p className="summary-nudge muted">
          Some platforms had no data for yesterday, so today&apos;s count is partial.
        </p>
      )}
    </section>
  );
}

import type { PlatformAdapter } from '@/platforms/types';
import type { HistoryPoint, Snapshot } from '@/storage/schema';
import { previousPoint } from '@/storage/repo';
import { ExternalIcon } from '../icons';
import { trendFor } from '@/shared/progress';
import { timeAgo } from '../useTracker';
import { DifficultyBar } from '../viz/DifficultyBar';
import { Sparkline } from '../viz/Sparkline';
import { Delta } from './Delta';
import { ManualCounter, type Counter } from './ManualCounter';
import { PlatformError } from './PlatformError';
import { StatBlock } from './StatBlock';
import './PlatformRow.css';
import './PlatformCard.css';

interface Props {
  adapter: PlatformAdapter;
  /** Absent for hand-kept counters, which need no username. */
  handle?: string;
  /** Present only for hand-kept counters, which are edited in place rather than fetched. */
  counter?: Counter;
  snapshot: Snapshot | undefined;
  history: HistoryPoint[] | undefined;
  today: string;
  busy: boolean;
  onRetry: () => void;
}

/**
 * The dashboard's card form. The popup uses PlatformRow instead — a grid of cards and
 * a stack of collapsible rows want genuinely different layouts — but both compose the
 * same leaves, so a change to a stat or an error state lands on both at once.
 */
export function PlatformCard({
  adapter,
  handle,
  counter,
  snapshot,
  history,
  today,
  busy,
  onRetry,
}: Props) {
  const stats = snapshot?.stats;
  const failed = snapshot?.status === 'error';
  const prior = previousPoint(history, today);
  const trend = trendFor(history);
  const primary = stats?.headline[0];

  const breakdown = stats?.solved;
  const hasBreakdown =
    breakdown !== undefined &&
    (breakdown.easy ?? breakdown.medium ?? breakdown.hard) !== undefined;
  // Not gated on the handle: a hand-kept counter has none, yet may still declare a page
  // worth linking to — a sheet's own URL, say.
  const profileHref = adapter.profileUrl?.(handle ?? '');

  return (
    <article className="card surface" style={{ borderLeftColor: adapter.accent }}>
      <header className="row spread">
        <div className="row card-title">
          <span className="dot" style={{ background: adapter.accent }} />
          <strong>{adapter.displayName}</strong>
        </div>
        {/* A hand-kept counter has no username and may have no page to link to. */}
        {profileHref ? (
          <a href={profileHref} target="_blank" rel="noreferrer" className="muted card-handle">
            {handle ?? 'Open'}
            <ExternalIcon size={11} />
          </a>
        ) : (
          handle && <span className="muted card-handle">{handle}</span>
        )}
      </header>

      {/* See PlatformRow: the counter replaces the stats, and renders with or without
          a snapshot so a newly created platform is immediately usable. */}
      {counter ? (
        <ManualCounter
          name={adapter.displayName}
          total={stats?.solved?.total ?? 0}
          target={counter.target}
          onChange={counter.onChange}
          delta={primary && stats && <Delta stat={primary} stats={stats} prior={prior} />}
        />
      ) : stats ? (
        <div className="stats">
          {stats.headline.map((stat) => (
            <StatBlock
              key={stat.label}
              label={stat.label}
              value={stat.value}
              delta={<Delta stat={stat} stats={stats} prior={prior} />}
            />
          ))}
        </div>
      ) : (
        !failed && <p className="muted prow-empty">{busy ? 'Fetching…' : 'No data yet'}</p>
      )}

      {hasBreakdown && (
        <DifficultyBar
          easy={breakdown.easy ?? 0}
          medium={breakdown.medium ?? 0}
          hard={breakdown.hard ?? 0}
        />
      )}

      {trend && <Sparkline points={trend.points} label={trend.label} />}

      {failed && snapshot && <PlatformError snapshot={snapshot} onRetry={onRetry} busy={busy} />}

      <footer className="muted card-foot">
        {busy ? 'Refreshing…' : `Updated ${timeAgo(snapshot?.fetchedAt ?? 0)}`}
      </footer>
    </article>
  );
}

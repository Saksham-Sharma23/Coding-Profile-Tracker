import { useId } from 'react';
import type { PlatformAdapter } from '@/platforms/types';
import { previousPoint } from '@/storage/repo';
import type { HistoryPoint, Snapshot, SolvedProblem } from '@/storage/schema';
import { AlertIcon, ChevronDownIcon, ExternalIcon } from '../icons';
import { trendFor } from '@/shared/progress';
import { timeAgo } from '../useTracker';
import { DifficultyBar } from '../viz/DifficultyBar';
import { Sparkline } from '../viz/Sparkline';
import { Delta } from './Delta';
import { ManualCounter, type Counter } from './ManualCounter';
import { PlatformError } from './PlatformError';
import { RecentProblems } from './RecentProblems';
import { StatBlock } from './StatBlock';
import './PlatformRow.css';

interface Props {
  adapter: PlatformAdapter;
  /** Absent for hand-kept counters, which need no username. */
  handle?: string;
  /** Present only for hand-kept counters, which are edited in place rather than fetched. */
  counter?: Counter;
  snapshot: Snapshot | undefined;
  history: HistoryPoint[] | undefined;
  solvedProblems: SolvedProblem[] | undefined;
  today: string;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onRetry: () => void;
}

/**
 * One platform as a collapsible row.
 *
 * Collapsed it shows the single number that platform is about; expanded it shows
 * everything. Five cards' worth of detail does not fit a popup, but five rows do, and
 * the expansion is remembered — so a user who mostly cares about one platform sees it
 * open every time without giving up the at-a-glance view of the rest.
 */
export function PlatformRow({
  adapter,
  handle,
  counter,
  snapshot,
  history,
  solvedProblems,
  today,
  busy,
  open,
  onToggle,
  onRetry,
}: Props) {
  const panelId = useId();
  const stats = snapshot?.stats;
  const failed = snapshot?.status === 'error';
  const prior = previousPoint(history, today);
  const primary = stats?.headline[0];
  const trend = trendFor(history);

  const breakdown = stats?.solved;
  const hasBreakdown =
    breakdown !== undefined &&
    (breakdown.easy ?? breakdown.medium ?? breakdown.hard) !== undefined;
  // Not gated on the handle: a hand-kept counter has none, yet may still declare a page
  // worth linking to — a sheet's own URL, say.
  const profileHref = adapter.profileUrl?.(handle ?? '');

  return (
    <article className="prow surface" style={{ borderLeftColor: adapter.accent }}>
      <h3 className="prow-heading">
        <button
          type="button"
          className="prow-head"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="dot" style={{ background: adapter.accent }} />
          <span className="prow-name">{adapter.displayName}</span>

          {/* A broken platform has to be visible without expanding it. */}
          {failed && <AlertIcon size={13} className="prow-alert" />}

          {!open && primary && (
            <span className="prow-peek">
              <span className="prow-peek-value num">
                {typeof primary.value === 'number' ? primary.value.toLocaleString() : primary.value}
              </span>
              <span className="prow-peek-label muted">{primary.label}</span>
              {stats && <Delta stat={primary} stats={stats} prior={prior} />}
            </span>
          )}

          <ChevronDownIcon size={16} className={open ? 'prow-chev open' : 'prow-chev'} />
        </button>
      </h3>

      <div id={panelId} className="prow-body" hidden={!open}>
        <div className="row spread prow-handle">
          {/* A hand-kept counter has no username and may have no page to link to. */}
          {profileHref ? (
            <a href={profileHref} target="_blank" rel="noreferrer">
              {handle ?? 'Open'}
              <ExternalIcon size={11} />
            </a>
          ) : (
            <span className="muted">{handle ?? ''}</span>
          )}
          <span className="muted prow-time">
            {busy ? 'Refreshing…' : `Updated ${timeAgo(snapshot?.fetchedAt ?? 0)}`}
          </span>
        </div>

        {/*
          A hand-kept counter is edited here rather than displayed, so the control
          replaces the headline stats instead of joining them. Deliberately outside the
          `stats` check: a counter created a moment ago has no snapshot yet, and must
          still offer a usable [−] 0 [+] rather than "No data yet".
        */}
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

        <RecentProblems adapter={adapter} problems={solvedProblems} />

        {stats?.badges?.length ? (
          <ul className="prow-badges">
            {stats.badges.slice(0, 6).map((badge) => (
              <li key={badge.name} className="prow-badge">
                {badge.name}
                {badge.tier && <span className="muted"> · {badge.tier}</span>}
              </li>
            ))}
          </ul>
        ) : null}

        {failed && snapshot && (
          <PlatformError snapshot={snapshot} onRetry={onRetry} busy={busy} />
        )}
      </div>
    </article>
  );
}

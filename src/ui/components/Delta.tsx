import type { HistoryPoint, Snapshot } from '@/storage/schema';
import type { HeadlineStat } from '@/platforms/types';
import { formatDay } from '../viz/scales';
import { ArrowDownIcon, ArrowUpIcon } from '../icons';

interface Props {
  stat: HeadlineStat;
  stats: NonNullable<Snapshot['stats']>;
  prior: HistoryPoint | undefined;
}

/**
 * Change since the most recent earlier day on record. Rendered only when there is a
 * prior point and the value actually moved, so a fresh install shows nothing rather
 * than claiming the user solved 487 problems today.
 *
 * The prior point can be older than yesterday when the browser was closed, so the
 * comparison day is named in the tooltip instead of being implied to be "today".
 */
export function Delta({ stat, stats, prior }: Props) {
  if (!stat.delta || !prior) return null;

  const current = stat.delta === 'solved' ? stats.solved?.total : stats.rating?.current;
  const before = prior[stat.delta];
  if (current === undefined || before === undefined) return null;

  const change = current - before;
  if (change === 0) return null;

  const up = change > 0;
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;

  return (
    <span className={up ? 'delta up' : 'delta down'} title={`Since ${formatDay(prior.d)}`}>
      <Icon size={10} />
      {Math.abs(change).toLocaleString()}
    </span>
  );
}

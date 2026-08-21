import type { PlatformAdapter } from '@/platforms/types';
import type { TrackerState } from '@/storage/schema';
import { SolvedLog } from '../SolvedLog';

interface Props {
  state: TrackerState;
  tracked: PlatformAdapter[];
  today: string;
}

/**
 * The solved log with the whole view to itself, so its search and its 50-row pages stop
 * competing with a chart and a heatmap for the same scroll.
 */
export function ProblemsView({ state, tracked, today }: Props) {
  return (
    <>
      <h2 className="view-title" tabIndex={-1}>
        Problems
      </h2>
      <SolvedLog state={state} tracked={tracked} today={today} />
    </>
  );
}

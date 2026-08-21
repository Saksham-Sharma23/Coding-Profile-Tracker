import type { PlatformAdapter } from '@/platforms/types';
import type { TrackerState } from '@/storage/schema';
import type { Counter } from '../../components/ManualCounter';
import { PlatformCard } from '../../components/PlatformCard';

interface Props {
  state: TrackerState;
  tracked: PlatformAdapter[];
  today: string;
  refreshing: boolean;
  onRetry: (id: string) => void;
  counterFor: (adapter: PlatformAdapter) => Counter | undefined;
}

/** Every tracked platform at full width, with the detail the old stacked page squeezed. */
export function PlatformsView({ state, tracked, today, refreshing, onRetry, counterFor }: Props) {
  return (
    <>
      <h2 className="view-title" tabIndex={-1}>
        Platforms
      </h2>

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
            onRetry={() => onRetry(adapter.id)}
          />
        ))}
      </section>
    </>
  );
}

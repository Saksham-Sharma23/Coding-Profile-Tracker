import type { Snapshot } from '@/storage/schema';
import { AlertIcon, RefreshIcon, SettingsIcon } from '../icons';

interface Props {
  snapshot: Snapshot;
  onRetry: () => void;
  busy: boolean;
}

/**
 * A failure with the remedy that actually fixes it.
 *
 * The adapters distinguish three failure kinds and until now all three collapsed into
 * one string. A typo'd username and an offline laptop are not the same problem, and
 * offering "Retry" for the first just wastes the user's time.
 */
export function PlatformError({ snapshot, onRetry, busy }: Props) {
  const stale = snapshot.stats ? ' Showing last known values.' : '';

  return (
    <div className="perror">
      <p className="perror-msg">
        <AlertIcon size={13} />
        <span>
          {message(snapshot)}
          {stale && <span className="muted">{stale}</span>}
        </span>
      </p>

      {snapshot.kind === 'handle-not-found' ? (
        <button className="btn-quiet" onClick={() => void chrome.runtime.openOptionsPage()}>
          <SettingsIcon size={12} /> Fix username
        </button>
      ) : snapshot.kind === 'scrape-failed' ? null : (
        // Network faults are retryable, and so is an unlabelled failure from a
        // snapshot written before failure kinds were recorded.
        <button className="btn-quiet" onClick={onRetry} disabled={busy}>
          <RefreshIcon size={12} className={busy ? 'spin' : undefined} /> Retry
        </button>
      )}
    </div>
  );
}

function message(snapshot: Snapshot): string {
  switch (snapshot.kind) {
    case 'handle-not-found':
      return 'No profile with that username.';
    case 'scrape-failed':
      return 'This site changed its page format, so the parser needs updating.';
    case 'fetch-failed':
      return "Couldn't reach the site.";
    default:
      return snapshot.error ?? 'Something went wrong.';
  }
}

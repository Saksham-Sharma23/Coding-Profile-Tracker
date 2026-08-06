import { useEffect, useState } from 'react';
import type { PlatformAdapter } from '@/platforms/types';
import type { TrackerState } from '@/storage/schema';
import { formatCountdown, nextContest } from '@/shared/countdown';
import { TrophyIcon } from '../icons';
import './ContestStrip.css';

interface Props {
  state: TrackerState;
  tracked: PlatformAdapter[];
}

export function ContestStrip({ state, tracked }: Props) {
  // Ticking in a page is fine — the no-setInterval rule is about the service worker,
  // which gets torn down; this component unmounts with its own timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const contest = nextContest(state, tracked, now);
  if (!contest) return null;

  const accent = tracked.find((adapter) => adapter.id === contest.platform)?.accent;

  return (
    <a className="contest surface" href={contest.url} target="_blank" rel="noreferrer">
      <span className="dot" style={{ background: accent }} />
      <TrophyIcon size={13} className="contest-icon" />
      <span className="contest-name">{contest.name}</span>
      <span className="contest-in num">in {formatCountdown(contest.startsAt - now)}</span>
    </a>
  );
}

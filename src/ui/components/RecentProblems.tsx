import type { PlatformId, SolvedProblem } from '@/platforms/types';
import { PROBLEM_LIST_PLATFORMS } from '@/shared/solved';
import { formatDay } from '../viz/scales';
import './RecentProblems.css';

interface Props {
  platform: PlatformId;
  problems: SolvedProblem[] | undefined;
  limit?: number;
}

/**
 * The last few problems solved on one platform.
 *
 * Platforms with no per-problem feed render nothing at all rather than an empty list —
 * "no problems" and "this site does not tell us" are different statements, and only
 * one of them is true here.
 */
export function RecentProblems({ platform, problems, limit = 5 }: Props) {
  if (!PROBLEM_LIST_PLATFORMS.includes(platform)) return null;

  const recent = (problems ?? []).slice(0, limit);
  if (!recent.length) {
    return <p className="recent-empty muted">No solved problems recorded yet.</p>;
  }

  return (
    <div className="recent">
      <p className="recent-head muted">Recently solved</p>
      <ul className="recent-list">
        {recent.map((problem) => (
          <li key={problem.key}>
            <a href={problem.url} target="_blank" rel="noreferrer" className="recent-name">
              {problem.name}
            </a>
            {problem.difficulty !== undefined && (
              <span className="recent-diff muted num">{problem.difficulty}</span>
            )}
            <span className="recent-when muted">{formatDay(new Date(problem.solvedAt).toISOString().slice(0, 10))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

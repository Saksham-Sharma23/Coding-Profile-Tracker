import { useMemo, useState } from 'react';
import type { PlatformAdapter } from '@/platforms/types';
import { allSolved, coverageNote, filterSolved, solvedOnDay } from '@/shared/solved';
import type { TrackerState } from '@/storage/schema';
import { ExternalIcon } from '../icons';
import { formatDay } from '../viz/scales';
import './SolvedLog.css';

const PAGE = 50;

interface Props {
  state: TrackerState;
  tracked: PlatformAdapter[];
  today: string;
}

/** Every problem the tracker has recorded, searchable by name, platform or tag. */
export function SolvedLog({ state, tracked, today }: Props) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  const entries = useMemo(() => allSolved(state, tracked), [state.solved, tracked]);
  const matches = useMemo(() => filterSolved(entries, query), [entries, query]);
  const todayCount = useMemo(() => solvedOnDay(entries, today).length, [entries, today]);
  const note = coverageNote(tracked);

  if (!entries.length) {
    return (
      <section className="viz surface solved-log">
        <h2>Problems solved</h2>
        <p className="muted solved-empty">
          Nothing recorded yet. Codeforces fills in your full history on the first
          refresh; LeetCode starts from your 20 most recent and grows from there.
        </p>
        {note && <p className="muted solved-note">{note}</p>}
      </section>
    );
  }

  const visible = matches.slice(0, shown);

  return (
    <section className="viz surface solved-log">
      <div className="row spread solved-head">
        <div>
          <h2>Problems solved</h2>
          <p className="viz-sub muted">
            {entries.length.toLocaleString()} recorded
            {todayCount > 0 && ` · ${todayCount} today`}
          </p>
        </div>
        <input
          type="search"
          value={query}
          placeholder="Search name, platform or tag"
          aria-label="Search solved problems"
          className="solved-search"
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
      </div>

      {note && <p className="muted solved-note">{note}</p>}

      {matches.length === 0 ? (
        <p className="muted solved-empty">Nothing matches “{query}”.</p>
      ) : (
        <>
          <div className="viz-table-wrap solved-wrap">
            <table className="viz-table solved-table">
              <thead>
                <tr>
                  <th scope="col">Problem</th>
                  <th scope="col">Platform</th>
                  <th scope="col">Level</th>
                  <th scope="col">Solved</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={`${entry.platform}:${entry.key}`}>
                    <th scope="row">
                      <a href={entry.url} target="_blank" rel="noreferrer">
                        {entry.name}
                        <ExternalIcon size={10} />
                      </a>
                      {entry.tags?.length ? (
                        <span className="solved-tags muted">{entry.tags.slice(0, 3).join(' · ')}</span>
                      ) : null}
                    </th>
                    <td className="solved-platform">
                      <span className="dot" style={{ background: entry.accent }} />
                      {entry.platformName}
                    </td>
                    <td>{entry.difficulty ?? '—'}</td>
                    <td>{formatDay(new Date(entry.solvedAt).toISOString().slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {shown < matches.length && (
            <button className="btn-quiet solved-more" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({(matches.length - shown).toLocaleString()} left)
            </button>
          )}
        </>
      )}
    </section>
  );
}

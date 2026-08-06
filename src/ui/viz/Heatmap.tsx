import { useId, useMemo, useState } from 'react';
import { calendarGrid, formatDay, heatBin } from './scales';
import './viz.css';

const CELL = 11;
// 2px of surface between cells — the gap does the separating, not a border.
const GAP = 2;
const ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

interface Props {
  calendar: Record<string, number>;
  today: string;
  sourceName: string;
}

export function Heatmap({ calendar, today, sourceName }: Props) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<{ iso: string; count: number } | undefined>();
  const titleId = useId();

  const cells = useMemo(() => calendarGrid(calendar, today), [calendar, today]);
  const max = useMemo(() => Math.max(1, ...cells.map((c) => c.count)), [cells]);
  const active = cells.filter((c) => c.count > 0);

  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const width = cols * (CELL + GAP) + 30;
  const height = 7 * (CELL + GAP) + 18;

  return (
    <figure className="viz surface">
      <figcaption className="row spread">
        <div>
          <h2 id={titleId}>Submission activity</h2>
          <p className="viz-sub muted">Last 27 weeks, from {sourceName}.</p>
        </div>
        <button className="viz-toggle" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </figcaption>

      {showTable ? (
        <div className="viz-table-wrap">
          <table className="viz-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Submissions</th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 ? (
                <tr>
                  <td colSpan={2} className="muted">
                    No submissions recorded in this window.
                  </td>
                </tr>
              ) : (
                [...active].reverse().map((c) => (
                  <tr key={c.iso}>
                    <th scope="row">{formatDay(c.iso)}</th>
                    <td>{c.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="viz-plot">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
            {ROW_LABELS.map((label, row) =>
              label ? (
                <text key={row} x={0} y={row * (CELL + GAP) + CELL} className="viz-tick">
                  {label}
                </text>
              ) : null,
            )}
            {cells.map((c) => (
              <rect
                key={c.iso}
                x={30 + c.col * (CELL + GAP)}
                y={c.row * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                fill={`var(--heat-${heatBin(c.count, max)})`}
                onMouseEnter={() => setHover(c)}
                onMouseLeave={() => setHover(undefined)}
              >
                {/* Must be a single text node — a browser renders a multi-child
                    SVG <title> as literal markup. */}
                <title>{`${c.count} on ${formatDay(c.iso)}`}</title>
              </rect>
            ))}
          </svg>

          <div className="row spread viz-scale">
            <span className="muted">
              {hover
                ? `${hover.count} submission${hover.count === 1 ? '' : 's'} · ${formatDay(hover.iso)}`
                : `${active.length} active days`}
            </span>
            {/* Scale legend — required for a continuous encoding. */}
            <span className="row viz-scale-key">
              <span className="muted">Less</span>
              {[0, 1, 2, 3, 4, 5].map((bin) => (
                <span key={bin} className="viz-swatch" style={{ background: `var(--heat-${bin})` }} />
              ))}
              <span className="muted">More</span>
            </span>
          </div>
        </div>
      )}
    </figure>
  );
}

import { useId, useMemo, useState } from 'react';
import {
  extentOf,
  formatDay,
  linePath,
  niceTicks,
  projector,
  type Pad,
  type Series,
} from './scales';
import './viz.css';

const WIDTH = 720;
const HEIGHT = 260;
// Left pad fits 4-digit ticks; right pad fits a 5-character end-label ("3,530")
// with margin; bottom pad holds the x-axis band so it is never clipped into a
// nested scrollbar.
const PAD: Pad = { top: 16, right: 56, bottom: 28, left: 48 };

interface Props {
  series: Series[];
}

export function RatingChart({ series }: Props) {
  const [hover, setHover] = useState<string | undefined>();
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const withData = series.filter((s) => s.points.length > 0);
  const extent = useMemo(() => extentOf(withData), [withData]);

  if (!extent) {
    return (
      <p className="viz-empty muted">
        No rating history yet — it builds up as the tracker refreshes each day.
      </p>
    );
  }

  const project = projector(extent, WIDTH, HEIGHT, PAD);
  const ticks = niceTicks(extent.minY, extent.maxY);

  // All dates present across every series, so the crosshair can snap to a real column.
  const columns = [...new Set(withData.flatMap((s) => s.points.map((p) => p.d)))].sort();
  const active = hover ?? columns[columns.length - 1];

  return (
    <figure className="viz surface">
      <figcaption className="row spread">
        <div>
          <h2 id={titleId}>Rating over time</h2>
          {/* With one series there is no legend box, so the subtitle names what is
              plotted; with several, the legend carries identity. */}
          <p className="viz-sub muted">
            {withData.length === 1
              ? withData[0]!.name
              : 'All platforms share one axis — separate scales would invent a correlation.'}
          </p>
        </div>
        <button className="viz-toggle" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </figcaption>

      {/* A legend is always present for two or more series; identity is never
          carried by color alone. */}
      {withData.length > 1 && (
        <ul className="viz-legend">
          {withData.map((s) => (
            <li key={s.id}>
              <span className="viz-key" style={{ background: `var(${s.colorVar})` }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      {showTable ? (
        <TableView series={withData} />
      ) : (
        <div className="viz-plot">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-labelledby={titleId}
            onMouseLeave={() => setHover(undefined)}
          >
            {/* Gridlines: solid hairlines, one step off the surface, recessive. */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={project.y(t)}
                  y2={project.y(t)}
                  stroke="var(--viz-grid)"
                  strokeWidth={1}
                />
                <text x={PAD.left - 8} y={project.y(t) + 4} className="viz-tick" textAnchor="end">
                  {t.toLocaleString()}
                </text>
              </g>
            ))}

            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={HEIGHT - PAD.bottom}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />

            {active && (
              <line
                x1={project.x(active)}
                x2={project.x(active)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--viz-axis)"
                strokeWidth={1}
              />
            )}

            {withData.map((s) => {
              const last = s.points[s.points.length - 1]!;
              const point = s.points.find((p) => p.d === active) ?? last;
              return (
                <g key={s.id}>
                  <path
                    d={linePath(s.points, project)}
                    fill="none"
                    stroke={`var(${s.colorVar})`}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* End marker: r>=4 with a 2px surface ring so overlapping series
                      stay legible where they cross. */}
                  <circle
                    cx={project.x(point.d)}
                    cy={project.y(point.v)}
                    r={4}
                    fill={`var(${s.colorVar})`}
                    stroke="var(--viz-surface)"
                    strokeWidth={2}
                  />
                  {/* Direct end-label: the value, per the line spec — the legend
                      carries identity, so repeating the name here would not fit in
                      the right pad and would collide across series. Also the relief
                      for aqua's sub-3:1 light-surface contrast. Text wears ink
                      tokens, never the series color. */}
                  <text
                    x={project.x(last.d) + 10}
                    y={project.y(last.v) + 4}
                    className="viz-endlabel"
                  >
                    {point.v.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {/* Generous invisible hit columns — never make the reader land on a dot. */}
            {columns.map((d) => (
              <rect
                key={d}
                x={project.x(d) - (WIDTH - PAD.left - PAD.right) / (columns.length * 2) - 6}
                y={PAD.top}
                width={(WIDTH - PAD.left - PAD.right) / columns.length + 12}
                height={HEIGHT - PAD.top - PAD.bottom}
                fill="transparent"
                onMouseEnter={() => setHover(d)}
              />
            ))}
          </svg>

          {active && <p className="viz-readout muted">{formatDay(active)}</p>}
        </div>
      )}
    </figure>
  );
}

/** The table twin. Every value stays reachable without hovering. */
function TableView({ series }: { series: Series[] }) {
  const days = [...new Set(series.flatMap((s) => s.points.map((p) => p.d)))].sort().reverse();

  return (
    <div className="viz-table-wrap">
      <table className="viz-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <th scope="row">{formatDay(d)}</th>
              {series.map((s) => (
                <td key={s.id}>{s.points.find((p) => p.d === d)?.v.toLocaleString() ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

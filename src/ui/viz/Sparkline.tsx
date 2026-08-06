import { useId } from 'react';
import { SPARK, sparkGeometry, type Point } from './scales';
import './viz.css';

interface Props {
  points: Point[];
  /** What the line plots — "Solved" or "Rating". Names the series, so no legend box. */
  label: string;
  /** Validated palette slot. One series per sparkline, so slot 1 unless told otherwise. */
  colorVar?: string;
}

/**
 * A single-series trend line, drawn from history the extension has been collecting all
 * along. No axes: the headline stat above it carries the current value, and the caption
 * carries the change over the window.
 */
export function Sparkline({ points, label, colorVar = '--viz-1' }: Props) {
  const titleId = useId();
  const geo = sparkGeometry(points);

  if (!geo) {
    return (
      <p className="spark-empty muted">
        {points.length === 1
          ? `${label} trend needs a second day of history.`
          : `No ${label.toLowerCase()} history yet.`}
      </p>
    );
  }

  const sign = geo.change > 0 ? '+' : '';
  const changeClass =
    geo.change > 0 ? 'spark-change up' : geo.change < 0 ? 'spark-change down' : 'spark-change muted';

  // Every metric plotted here — solve counts, Elo — is conceptually a whole number,
  // and a stray float (LeetCode's contest rating is one before its adapter rounds it)
  // would otherwise render as "1,693.923".
  const show = (value: number) => Math.round(value).toLocaleString();

  return (
    <figure className="spark">
      <figcaption className="row spread spark-cap">
        <span className="muted">
          {label} · last {points.length} {points.length === 1 ? 'day' : 'days'}
        </span>
        <span className={changeClass}>
          {Math.round(geo.change) === 0 ? 'no change' : `${sign}${show(geo.change)}`}
        </span>
      </figcaption>

      <svg
        width={SPARK.width}
        height={SPARK.height}
        viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
        role="img"
        aria-labelledby={titleId}
        className="spark-svg"
      >
        {/* One text node only — a browser renders a multi-child SVG <title> as
            literal markup. */}
        <title
          id={titleId}
        >{`${label} from ${show(geo.first)} to ${show(geo.last)} across ${points.length} days`}</title>

        <path
          d={geo.path}
          fill="none"
          stroke={`var(${colorVar})`}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End marker: r 4 filled, inside a 2px ring punched out to the surface so it
            stays legible where it sits on top of the line. */}
        <circle cx={geo.end.x} cy={geo.end.y} r={6} fill="var(--viz-surface)" />
        <circle cx={geo.end.x} cy={geo.end.y} r={4} fill={`var(${colorVar})`} />
      </svg>
    </figure>
  );
}

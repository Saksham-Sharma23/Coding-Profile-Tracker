import { Fragment } from 'react';
import { barPercents } from './scales';
import './viz.css';

interface Props {
  easy: number;
  medium: number;
  hard: number;
}

/**
 * Solved counts per difficulty, as a small bar chart.
 *
 * Difficulty is ordinal, so the bars wear a one-hue ramp whose lightness carries the
 * order (see viz/tokens.css) rather than the old green/amber/red rainbow. Bars are
 * normalized to the largest count — the comparison is "how many of each", not "what
 * share of the total" — and every raw number is printed beside its bar, so the bar is
 * the glance and the number is the truth.
 */
export function DifficultyBar({ easy, medium, hard }: Props) {
  const rows = [
    { key: 'easy', label: 'Easy', count: easy, colorVar: '--diff-easy' },
    { key: 'medium', label: 'Medium', count: medium, colorVar: '--diff-medium' },
    { key: 'hard', label: 'Hard', count: hard, colorVar: '--diff-hard' },
  ];
  const percents = barPercents(rows.map((row) => row.count));

  return (
    <div className="diffbar">
      {rows.map((row, index) => (
        <Fragment key={row.key}>
          <span className="diff-label muted">{row.label}</span>
          <span className="diff-track">
            <span
              className="diff-fill"
              style={{ width: `${percents[index]!.toFixed(1)}%`, background: `var(${row.colorVar})` }}
            />
          </span>
          <span className="diff-count num">{row.count.toLocaleString()}</span>
        </Fragment>
      ))}
    </div>
  );
}

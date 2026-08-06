import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string | number;
  delta?: ReactNode;
}

/**
 * One headline number with its label.
 *
 * Values are `string | number` and include things like 'Unrated' and '★★★★★', so
 * tabular figures are applied only when the value is actually numeric — forcing every
 * digit to a zero's width makes short numbers look loose, and does nothing for stars.
 */
export function StatBlock({ label, value, delta }: Props) {
  const numeric = typeof value === 'number';

  return (
    <div className="stat">
      <span className="row stat-top">
        <span className={numeric ? 'stat-value num' : 'stat-value'}>
          {numeric ? value.toLocaleString() : value}
        </span>
        {delta}
      </span>
      <span className="stat-label muted">{label}</span>
    </div>
  );
}

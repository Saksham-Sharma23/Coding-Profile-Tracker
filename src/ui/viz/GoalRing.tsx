import { useId } from 'react';

const SIZE = 40;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  done: number;
  goal: number;
}

/**
 * Progress toward the daily goal, as a meter.
 *
 * The unfilled track is a lighter step of the fill's own ramp rather than a neutral
 * gray, so the ring reads as one scale. Overshooting fills the ring completely — the
 * arc cannot express "more than done", and the count beside it carries the real number.
 */
export function GoalRing({ done, goal }: Props) {
  const titleId = useId();
  const ratio = goal > 0 ? Math.min(1, done / goal) : 0;
  const complete = goal > 0 && done >= goal;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-labelledby={titleId}
      className="goal-ring"
    >
      <title id={titleId}>{`${done} of ${goal} solved today`}</title>

      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="var(--meter-track)"
        strokeWidth={STROKE}
      />
      {ratio > 0 && (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={complete ? 'var(--ok)' : 'var(--viz-1)'}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          // Start the arc at 12 o'clock instead of 3.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      )}
    </svg>
  );
}

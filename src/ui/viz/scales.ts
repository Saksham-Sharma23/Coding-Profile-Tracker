/** Pure chart maths, kept free of React and the DOM so it can be unit-tested. */

export interface Point {
  d: string;
  v: number;
}

export interface Series {
  id: string;
  name: string;
  /** CSS custom property holding this series' validated palette slot. */
  colorVar: string;
  points: Point[];
}

export function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/**
 * Rounds a range out to clean tick values. Axis ticks carry every value that is not
 * directly labelled, so they must land on readable numbers.
 */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];

  const raw = (max - min) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 0.001; t += step) {
    ticks.push(Math.round(t * 1000) / 1000);
  }
  return ticks;
}

export interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Shared extent across all series — every rating is plotted on ONE y-axis. Separate
 * scales per platform would invent correlations that are not in the data.
 */
export function extentOf(series: Series[]): Extent | undefined {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of series) {
    for (const p of s.points) {
      xs.push(dayNumber(p.d));
      ys.push(p.v);
    }
  }
  if (!xs.length || !ys.length) return undefined;

  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  // A flat series would collapse to a zero-height plot; give it breathing room.
  if (minY === maxY) {
    minY -= 10;
    maxY += 10;
  } else {
    const pad = (maxY - minY) * 0.1;
    minY -= pad;
    maxY += pad;
  }

  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY, maxY };
}

export interface Projector {
  x(iso: string): number;
  y(value: number): number;
}

export function projector(extent: Extent, width: number, height: number, pad: Pad): Projector {
  const spanX = extent.maxX - extent.minX || 1;
  const spanY = extent.maxY - extent.minY || 1;
  return {
    x: (iso) =>
      pad.left + ((dayNumber(iso) - extent.minX) / spanX) * (width - pad.left - pad.right),
    y: (value) =>
      height - pad.bottom - ((value - extent.minY) / spanY) * (height - pad.top - pad.bottom),
  };
}

export interface Pad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function linePath(points: Point[], project: Projector): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${project.x(p.d).toFixed(1)},${project.y(p.v).toFixed(1)}`)
    .join(' ');
}

/** Fixed geometry for the row sparkline. The popup is fixed-width, so is this. */
export const SPARK = {
  width: 220,
  height: 40,
  // Right/top/bottom padding clears the end marker: r 4 plus its 2px surface ring.
  pad: { top: 7, right: 7, bottom: 7, left: 1 } as Pad,
};

export interface SparkGeometry {
  path: string;
  end: { x: number; y: number };
  first: number;
  last: number;
  change: number;
}

/**
 * Geometry for a single-series sparkline, or undefined when there is nothing to draw.
 *
 * Under two points there is no trend to show — one point is a dot, not a direction —
 * so callers render a "not enough history" note instead of a misleading flat line.
 */
export function sparkGeometry(
  points: Point[],
  width = SPARK.width,
  height = SPARK.height,
  pad = SPARK.pad,
): SparkGeometry | undefined {
  if (points.length < 2) return undefined;

  const extent = extentOf([{ id: 'spark', name: 'spark', colorVar: '', points }]);
  if (!extent) return undefined;

  const project = projector(extent, width, height, pad);
  const first = points[0]!.v;
  const final = points[points.length - 1]!;

  return {
    path: linePath(points, project),
    end: { x: project.x(final.d), y: project.y(final.v) },
    first,
    last: final.v,
    change: final.v - first,
  };
}

/**
 * Bar lengths for the difficulty breakdown, as a percentage of the widest bar.
 *
 * Normalized to the max rather than the total: the question these bars answer is
 * "how many of each have I solved", which is a comparison, not a composition. A
 * count of zero gets a zero-length bar — the printed number carries it.
 */
export function barPercents(counts: number[]): number[] {
  const max = Math.max(0, ...counts);
  if (max <= 0) return counts.map(() => 0);
  return counts.map((count) => (count > 0 ? (count / max) * 100 : 0));
}

/**
 * Bins submission counts into the five sequential steps. Bin 0 is reserved for days
 * with no activity so "none" stays visually distinct from "a little".
 */
export function heatBin(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 1) return 5;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  if (ratio < 1) return 4;
  return 5;
}

/**
 * Calendar grid for the trailing `weeks` weeks, ending on the week containing
 * `endIso`. Columns are weeks, rows are weekdays (Sunday first).
 */
export function calendarGrid(
  calendar: Record<string, number>,
  endIso: string,
  weeks = 27,
): { iso: string; count: number; col: number; row: number }[] {
  const end = new Date(`${endIso}T00:00:00Z`);
  // Walk back to the Saturday ending the final column, so the grid is rectangular.
  const endOfWeek = new Date(end);
  endOfWeek.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const cells: { iso: string; count: number; col: number; row: number }[] = [];
  const totalDays = weeks * 7;

  for (let i = totalDays - 1; i >= 0; i--) {
    const day = new Date(endOfWeek);
    day.setUTCDate(endOfWeek.getUTCDate() - i);
    const iso = day.toISOString().slice(0, 10);
    const index = totalDays - 1 - i;
    cells.push({
      iso,
      count: calendar[iso] ?? 0,
      col: Math.floor(index / 7),
      row: day.getUTCDay(),
    });
  }
  return cells;
}

export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

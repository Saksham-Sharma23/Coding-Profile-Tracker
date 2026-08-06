import { describe, expect, it } from 'vitest';
import {
  barPercents,
  calendarGrid,
  extentOf,
  heatBin,
  niceTicks,
  sparkGeometry,
  SPARK,
  type Series,
} from './scales';

describe('niceTicks', () => {
  it('lands on clean round numbers', () => {
    expect(niceTicks(1480, 1620)).toEqual([1500, 1550, 1600]);
  });

  it('handles a flat range without looping forever', () => {
    expect(niceTicks(1500, 1500)).toEqual([1500]);
    expect(niceTicks(NaN, 10)).toEqual([]);
  });
});

describe('extentOf', () => {
  const series = (id: string, points: [string, number][]): Series => ({
    id,
    name: id,
    colorVar: '--viz-1',
    points: points.map(([d, v]) => ({ d, v })),
  });

  it('spans every series on ONE shared y-axis', () => {
    // A per-series scale would invent correlations that are not in the data.
    const extent = extentOf([
      series('a', [['2026-01-01', 1500]]),
      series('b', [['2026-01-02', 2500]]),
    ])!;
    expect(extent.minY).toBeLessThan(1500);
    expect(extent.maxY).toBeGreaterThan(2500);
  });

  it('gives a flat series height so it does not collapse', () => {
    const extent = extentOf([series('a', [['2026-01-01', 1500], ['2026-01-02', 1500]])])!;
    expect(extent.maxY).toBeGreaterThan(extent.minY);
  });

  it('returns undefined when there is nothing to plot', () => {
    expect(extentOf([])).toBeUndefined();
    expect(extentOf([series('a', [])])).toBeUndefined();
  });
});

describe('heatBin', () => {
  it('reserves bin 0 for days with no activity', () => {
    // "None" must stay visually distinct from "a little".
    expect(heatBin(0, 10)).toBe(0);
    expect(heatBin(1, 10)).toBe(1);
  });

  it('puts the busiest day in the top bin', () => {
    expect(heatBin(10, 10)).toBe(5);
  });

  it('increases monotonically with count', () => {
    const bins = [1, 3, 5, 8, 10].map((n) => heatBin(n, 10));
    expect(bins).toEqual([...bins].sort((a, b) => a - b));
  });
});

describe('calendarGrid', () => {
  it('builds a rectangular 7-row grid ending on the final week', () => {
    const cells = calendarGrid({}, '2026-08-03', 4);
    expect(cells).toHaveLength(28);
    expect(new Set(cells.map((c) => c.row)).size).toBe(7);
    expect(cells.every((c) => c.col >= 0 && c.col < 4)).toBe(true);
  });

  it('maps counts onto the right dates and defaults the rest to zero', () => {
    const cells = calendarGrid({ '2026-08-01': 7 }, '2026-08-03', 4);
    expect(cells.find((c) => c.iso === '2026-08-01')?.count).toBe(7);
    expect(cells.find((c) => c.iso === '2026-07-30')?.count).toBe(0);
  });

  it('places each date in its correct weekday row', () => {
    // 2026-08-03 is a Monday.
    const cells = calendarGrid({}, '2026-08-03', 4);
    expect(cells.find((c) => c.iso === '2026-08-03')?.row).toBe(1);
  });
});

describe('sparkGeometry', () => {
  const points = (values: number[]) =>
    values.map((v, i) => ({ d: `2026-08-${String(i + 1).padStart(2, '0')}`, v }));

  it('refuses to draw a trend from fewer than two points', () => {
    // One point is a dot, not a direction — a flat line would imply "no change",
    // which is a claim the data cannot support.
    expect(sparkGeometry([])).toBeUndefined();
    expect(sparkGeometry(points([12]))).toBeUndefined();
  });

  it('produces a finite path anchored to the padding', () => {
    const geo = sparkGeometry(points([10, 14, 12, 19]));
    expect(geo).toBeDefined();
    expect(geo!.path).not.toMatch(/NaN|Infinity/);

    const firstX = Number(geo!.path.match(/^M([\d.]+),/)![1]);
    expect(firstX).toBeCloseTo(SPARK.pad.left, 5);
    expect(geo!.end.x).toBeCloseTo(SPARK.width - SPARK.pad.right, 5);
  });

  it('keeps the end marker clear of the edges so its surface ring is not clipped', () => {
    const geo = sparkGeometry(points([10, 40, 5, 22]))!;
    expect(geo.end.y).toBeGreaterThanOrEqual(SPARK.pad.top);
    expect(geo.end.y).toBeLessThanOrEqual(SPARK.height - SPARK.pad.bottom);
  });

  it('reports first, last and the net change', () => {
    const geo = sparkGeometry(points([100, 120, 90]))!;
    expect(geo.first).toBe(100);
    expect(geo.last).toBe(90);
    expect(geo.change).toBe(-10);
  });

  it('centres a completely flat series instead of dividing by zero', () => {
    const geo = sparkGeometry(points([7, 7, 7]))!;
    expect(geo.path).not.toMatch(/NaN/);
    expect(geo.change).toBe(0);
    expect(geo.end.y).toBeCloseTo(SPARK.height / 2, 5);
  });
});

describe('barPercents', () => {
  it('normalizes to the widest bar, not the total', () => {
    // Comparison, not composition: 32 easy is the full bar even though it is only
    // 80% of the 40 problems solved.
    expect(barPercents([32, 8, 0])).toEqual([100, 25, 0]);
  });

  it('gives a zero count a zero-length bar', () => {
    expect(barPercents([0, 0, 0])).toEqual([0, 0, 0]);
    expect(barPercents([5, 0, 5])).toEqual([100, 0, 100]);
  });
});

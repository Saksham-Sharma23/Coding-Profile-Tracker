// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DifficultyBar } from './DifficultyBar';
import { GoalRing } from './GoalRing';
import { Heatmap } from './Heatmap';
import { RatingChart } from './RatingChart';
import { Sparkline } from './Sparkline';
import { SPARK, type Series } from './scales';

const WIDTH = 720;
const HEIGHT = 260;

function ratingSeries(): Series[] {
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 6, 1 + i));
    return date.toISOString().slice(0, 10);
  });
  return [
    {
      id: 'codeforces',
      name: 'Codeforces',
      colorVar: '--viz-1',
      points: days.map((d, i) => ({ d, v: 1500 + i * 12 })),
    },
    {
      id: 'leetcode',
      name: 'LeetCode',
      colorVar: '--viz-2',
      points: days.map((d, i) => ({ d, v: 2100 + Math.sin(i / 3) * 80 })),
    },
    {
      id: 'codechef',
      name: 'CodeChef',
      colorVar: '--viz-3',
      points: days.map((d, i) => ({ d, v: 1800 - i * 4 })),
    },
  ];
}

/** Every number appearing in an SVG geometry attribute of the markup. */
function coords(markup: string, attr: string): number[] {
  return [...markup.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].flatMap((m) =>
    (m[1] ?? '').split(/[ ,LM]+/).filter(Boolean).map(Number),
  );
}

describe('RatingChart rendering', () => {
  const markup = renderToStaticMarkup(<RatingChart series={ratingSeries()} />);

  it('emits no NaN or Infinity in the geometry', () => {
    // A single bad projection silently produces an invisible or exploded chart.
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it('keeps every plotted point inside the viewBox', () => {
    const xs = [...coords(markup, 'cx'), ...coords(markup, 'x1'), ...coords(markup, 'x2')];
    const ys = [...coords(markup, 'cy'), ...coords(markup, 'y1'), ...coords(markup, 'y2')];

    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(WIDTH);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(HEIGHT);
  });

  it('leaves room for end-labels inside the right pad', () => {
    // Labels sit at the last point + 10px; a 5-char value at 10px is ~34px, so the
    // 56px right pad must not be overrun.
    const labelXs = [...markup.matchAll(/<text x="([\d.]+)"[^>]*class="viz-endlabel"/g)].map((m) =>
      Number(m[1]),
    );
    expect(labelXs.length).toBe(3);
    for (const x of labelXs) expect(x + 40).toBeLessThanOrEqual(WIDTH);
  });

  it('ships a legend for multiple series so identity is never color-alone', () => {
    expect(markup).toContain('viz-legend');
    for (const name of ['Codeforces', 'LeetCode', 'CodeChef']) {
      expect(markup).toContain(name);
    }
  });

  it('uses 2px lines and ringed end markers per the mark spec', () => {
    expect(markup).toMatch(/stroke-width="2"/);
    expect(markup).toMatch(/r="4"/);
  });

  it('renders an honest empty state instead of a broken axis', () => {
    const empty = renderToStaticMarkup(<RatingChart series={[]} />);
    expect(empty).toContain('No rating history yet');
    expect(empty).not.toContain('<svg');
  });
});

describe('Heatmap rendering', () => {
  const calendar = { '2026-08-01': 5, '2026-07-28': 2, '2026-06-15': 9 };
  const markup = renderToStaticMarkup(
    <Heatmap calendar={calendar} today="2026-08-03" sourceName="LeetCode" />,
  );

  it('emits no NaN in the grid', () => {
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it('draws one cell per day of the window', () => {
    expect([...markup.matchAll(/<rect /g)]).toHaveLength(27 * 7);
  });

  it('separates cells with a 2px surface gap rather than borders', () => {
    // Cells are 11px on an 13px pitch, so the gap does the separating.
    const xs = coords(markup, 'x').filter((n) => n >= 30);
    const unique = [...new Set(xs)].sort((a, b) => a - b);
    expect((unique[1] ?? 0) - (unique[0] ?? 0)).toBe(13);
    expect(markup).not.toMatch(/<rect[^>]*stroke=/);
  });

  it('includes a scale legend and a table twin', () => {
    expect(markup).toContain('viz-swatch');
    expect(markup).toContain('Less');
    expect(markup).toContain('More');
    expect(markup).toContain('Show table');
  });
});

describe('Sparkline rendering', () => {
  const points = Array.from({ length: 30 }, (_, i) => ({
    d: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
    v: 1400 + i * 9 + Math.sin(i / 4) * 40,
  }));
  const markup = renderToStaticMarkup(<Sparkline points={points} label="Rating" />);

  it('emits no NaN in the path', () => {
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it('uses a 2px line and a ringed end marker per the mark spec', () => {
    expect(markup).toMatch(/stroke-width="2"/);
    // r=6 surface ring behind an r=4 marker.
    expect(markup).toMatch(/r="6"/);
    expect(markup).toMatch(/r="4"/);
  });

  it('keeps the whole line inside the viewBox', () => {
    // Anchored to <path d=, because `aria-labelledby="` also ends in `d="`.
    const path = /<path d="([^"]+)"/.exec(markup)![1]!;
    const nums = path.split(/[ ,LM]+/).filter(Boolean).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(SPARK.width);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(SPARK.height);
  });

  it('names the series in its accessible label, so no legend box is needed', () => {
    expect(markup).toContain('<title');
    expect(markup).toMatch(/Rating from [\d,]+ to [\d,]+ across 30 days/);
    expect(markup).not.toContain('viz-legend');
  });

  it('renders a note instead of a flat line when there is no trend to show', () => {
    const single = renderToStaticMarkup(
      <Sparkline points={[{ d: '2026-08-01', v: 10 }]} label="Solved" />,
    );
    expect(single).toContain('needs a second day');
    expect(single).not.toContain('<svg');
  });
});

describe('DifficultyBar rendering', () => {
  const markup = renderToStaticMarkup(<DifficultyBar easy={32} medium={8} hard={0} />);

  it('normalizes bar widths to the largest count', () => {
    const widths = [...markup.matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(widths).toEqual([100, 25, 0]);
  });

  it('prints every raw number, including the zero its bar cannot show', () => {
    expect(markup).toContain('>32<');
    expect(markup).toContain('>8<');
    expect(markup).toContain('>0<');
  });

  it('wears the ordinal ramp rather than three unrelated hues', () => {
    expect(markup).toContain('var(--diff-easy)');
    expect(markup).toContain('var(--diff-medium)');
    expect(markup).toContain('var(--diff-hard)');
  });
});

describe('GoalRing rendering', () => {
  it('fills proportionally and never overshoots the circle', () => {
    const half = renderToStaticMarkup(<GoalRing done={5} goal={10} />);
    const offset = Number(/stroke-dashoffset="([\d.]+)"/.exec(half)![1]);
    const total = Number(/stroke-dasharray="([\d.]+)"/.exec(half)![1]);
    expect(offset / total).toBeCloseTo(0.5, 5);

    const over = renderToStaticMarkup(<GoalRing done={40} goal={10} />);
    expect(Number(/stroke-dashoffset="([\d.]+)"/.exec(over)![1])).toBe(0);
  });

  it('states the real numbers in its accessible label', () => {
    expect(renderToStaticMarkup(<GoalRing done={3} goal={5} />)).toContain('3 of 5 solved today');
  });
});

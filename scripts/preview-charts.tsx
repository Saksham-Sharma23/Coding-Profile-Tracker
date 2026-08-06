/**
 * Renders the dashboard charts to a standalone HTML file with sample data, so the
 * visual layout can be checked in a browser without loading the extension or
 * waiting days for real history to accumulate.
 *
 *   npm run preview:charts   ->   preview/charts.html
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { DifficultyBar } from '../src/ui/viz/DifficultyBar';
import { GoalRing } from '../src/ui/viz/GoalRing';
import { Heatmap } from '../src/ui/viz/Heatmap';
import { RatingChart } from '../src/ui/viz/RatingChart';
import { Sparkline } from '../src/ui/viz/Sparkline';
import type { Series } from '../src/ui/viz/scales';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const DAYS = 90;
const today = new Date();
const iso = (offset: number) =>
  new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);

const days = Array.from({ length: DAYS }, (_, i) => iso(DAYS - 1 - i));

const series: Series[] = [
  {
    id: 'codeforces',
    name: 'Codeforces',
    colorVar: '--viz-1',
    points: days.map((d, i) => ({ d, v: Math.round(1420 + i * 1.6 + Math.sin(i / 5) * 45) })),
  },
  {
    id: 'leetcode',
    name: 'LeetCode',
    colorVar: '--viz-2',
    points: days.map((d, i) => ({ d, v: Math.round(1810 + Math.sin(i / 9) * 120 + i * 0.7) })),
  },
  {
    id: 'codechef',
    name: 'CodeChef',
    colorVar: '--viz-3',
    points: days.map((d, i) => ({ d, v: Math.round(1650 + Math.cos(i / 7) * 70) })),
  },
];

// Plausible activity: busier on weekdays, with a few quiet stretches.
const calendar: Record<string, number> = {};
for (let i = 0; i < 190; i++) {
  const date = iso(i);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const base = weekday === 0 || weekday === 6 ? 1 : 4;
  const count = Math.max(0, Math.round(base + Math.sin(i / 4) * 3 - (i % 11 === 0 ? 5 : 0)));
  if (count > 0) calendar[date] = count;
}

const trend = days.slice(-30).map((d, i) => ({
  d,
  v: Math.round(1480 + i * 7 + Math.sin(i / 4) * 55),
}));

/** Renders the small marks twice, once per theme, so both can be eyeballed at once. */
const smallMarks = (theme: 'light' | 'dark') => `
<section class="pane" data-theme="${theme}">
  <p class="pane-label muted">${theme}</p>
  <div class="card">
    <p class="cap muted">Sparkline — trending up</p>
    ${renderToStaticMarkup(<Sparkline points={trend} label="Rating" />)}
  </div>
  <div class="card">
    <p class="cap muted">Sparkline — flat, and too short to plot</p>
    ${renderToStaticMarkup(<Sparkline points={trend.slice(0, 6).map((p) => ({ ...p, v: 1500 }))} label="Solved" />)}
    ${renderToStaticMarkup(<Sparkline points={[{ d: iso(0), v: 40 }]} label="Solved" />)}
  </div>
  <div class="card">
    <p class="cap muted">Difficulty — note the zero bar keeps its number</p>
    ${renderToStaticMarkup(<DifficultyBar easy={132} medium={48} hard={0} />)}
  </div>
  <div class="card">
    <p class="cap muted">Goal ring — under, met, overshot</p>
    <div class="rings">
      ${renderToStaticMarkup(<GoalRing done={1} goal={5} />)}
      ${renderToStaticMarkup(<GoalRing done={3} goal={5} />)}
      ${renderToStaticMarkup(<GoalRing done={5} goal={5} />)}
      ${renderToStaticMarkup(<GoalRing done={9} goal={5} />)}
    </div>
  </div>
</section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Chart preview — Coding Profile Tracker</title>
<style>
${read('src/ui/theme.css')}
${read('src/ui/viz/tokens.css')}
${read('src/ui/viz/viz.css')}
body { padding: 32px 24px; }
main { max-width: 900px; margin: 0 auto; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted);
     margin: 32px 0 12px; }
.note { margin: 0 0 24px; font-size: 12px; }
.panes { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pane { background: var(--bg); color: var(--text); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 16px; }
.pane-label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 12px; }
.pane .card { background: var(--surface); border: 1px solid var(--border);
              border-radius: var(--radius); padding: 12px; margin-bottom: 12px; }
.cap { font-size: 10px; margin: 0 0 8px; }
.rings { display: flex; gap: 12px; }
</style>
</head>
<body>
<main>
  <h1>Chart preview</h1>
  <p class="note muted">
    Sample data. The "Show table" buttons are inert here — this is static markup, not the React app.
    The two panes below stamp data-theme explicitly, so both themes are visible at once;
    the full charts follow your OS setting.
  </p>

  <h2>Popup marks</h2>
  <div class="panes">${smallMarks('light')}${smallMarks('dark')}</div>

  <h2>Dashboard charts</h2>
  ${renderToStaticMarkup(<RatingChart series={series} />)}
  ${renderToStaticMarkup(<Heatmap calendar={calendar} today={iso(0)} sourceName="LeetCode" />)}
</main>
</body>
</html>
`;

mkdirSync(resolve(root, 'preview'), { recursive: true });
writeFileSync(resolve(root, 'preview/charts.html'), html, 'utf8');
console.log('Wrote preview/charts.html');

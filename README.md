# Coding Profile Tracker

A Chrome extension that shows your LeetCode, Codeforces, HackerRank, CodeChef and
GeeksforGeeks progress in one place, so you don't have to open five sites to check
where you are.

**No backend.** An MV3 service worker with `host_permissions` is exempt from CORS, so
the extension talks to each platform directly. Nothing leaves your machine, there is
no account, and there is no server to pay for. All state lives in `chrome.storage.local`.

## What it does

- **Popup** — a summary strip (solved today against your goal, streak, lifetime total)
  over one collapsible row per platform. Rows remember whether they were open.
- **Trends** — every row draws a sparkline from history the extension has been
  collecting since install; nothing extra is fetched for it.
- **Toolbar badge** — today's solve count, so progress is visible without opening
  anything.
- **Contest countdown** — the next Codeforces or LeetCode contest, on the platforms you
  track.
- **Daily reminder** — optional, one notification a day, and only when you are behind.
- **Dashboard** — rating chart, submission heatmap, per-platform cards.
- **Control** — per-platform pause and reorder, light/dark/system theme, JSON
  export/import, and a full reset.

## Install (development)

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select the `dist/` folder. The options page opens on first install; enter a username
for each platform you want tracked.

`npm run dev` runs Vite with hot reload against the same `dist/` output.

## How it gets the data

The five platforms cooperate to very different degrees. Each is one self-contained
adapter behind a shared interface, so a change to one cannot affect the others.

| Platform | Source | Notes |
|---|---|---|
| Codeforces | Official REST API | Documented and stable. Unknown handles return **HTTP 400** carrying a `status: "FAILED"` envelope. Rate limited to ~1 req/sec, so its calls are sequenced. |
| LeetCode | Public GraphQL, no auth | Unknown users return **HTTP 200** with `matchedUser: null`. `submissionCalendar` is a JSON *string* needing a second parse; contest rating is a float and is rounded. |
| HackerRank | Undocumented JSON | `/rest/hackers/{h}/badges` + `/rest/contests/master/hackers/{h}/profile`. 404s for unknown users. No stability guarantee. |
| GeeksforGeeks | `authapi.geeksforgeeks.org` JSON | Profile pages are Next.js RSC streams with no embedded JSON, but the auth API returns the same numbers cleanly. Unknown handles return 400 with an **empty body**. |
| CodeChef | HTML scrape | The only scraper. Unknown users get the **generic landing page with HTTP 200**, so a missing `.rating-number` is how "no such user" is detected. |

Contests come from two extra endpoints, kept outside the `PlatformAdapter` contract
because they need no handle and are the same for every user: Codeforces'
documented `contest.list` (filtered on `phase === "BEFORE"` — a running contest still
has a start time in the past) and LeetCode's undocumented `topTwoContests`. They are
refetched at most every six hours, riding the existing alarm rather than adding one.

### Things deliberately not reported

- **HackerRank has no solved count.** Its MultiDomain "Problem Solving" badge overlaps
  the per-language badges, so summing their `solved` fields would double-count and
  corrupt the dashboard's cross-platform total. HackerRank publishes no unambiguous
  total, and reporting none beats reporting a wrong one.
- **GeeksforGeeks `score` is not mapped to `rating`.** It is a points total, not an Elo
  rating; charting it beside Codeforces would misrepresent it.
- **"Solved today" is measured against yesterday's history point specifically**, not
  against the most recent earlier one. After a three-day gap the latter would report
  three days of work as today's. With no point for yesterday the number is `—`, not a
  guess — which is also why the reminder stays silent on an unmeasurable day.
- **Streaks are attributed, never merged.** Only LeetCode and GeeksforGeeks publish
  one, so it renders as "12 days · LeetCode". A bare "12-day streak" would read as a
  cross-platform figure the tracker has no way to compute.

## Architecture

```
src/
  background/      service worker: alarms, refresh orchestration, badge, reminder
  platforms/       one adapter per site + the shared PlatformAdapter contract
  shared/          derived numbers used by both the UI and the service worker
  offscreen/       DOM parsing host (service workers have no DOMParser)
  storage/         versioned schema, migrations, typed repo
  ui/              popup, dashboard, options, shared components, theme tokens
  ui/viz/          hand-rolled SVG charts
  content/         username auto-detect (suggestions only)
scripts/
  make-icons.mjs   draws the icon set (no raster dependency)
```

`shared/` exists so the popup's "solved today" and the toolbar badge's number come from
the same function and cannot disagree.

The popup renders `PlatformRow` (collapsible), the dashboard renders `PlatformCard`
(grid). Both compose the same leaves — `StatBlock`, `Delta`, `Sparkline`,
`DifficultyBar`, `PlatformError` — so a change lands on both at once.

Adding a sixth platform is a new file in `platforms/` plus one line in
`platforms/registry.ts`.

Two MV3 constraints shape the design:

1. **Service workers have no `DOMParser`**, so CodeChef's HTML round-trips through an
   offscreen document.
2. **Service workers are torn down after ~30s idle**, so scheduling uses
   `chrome.alarms` (never `setInterval`) and nothing is cached in module scope.

### Failure handling

Adapters fail independently — `Promise.allSettled`, per-adapter timeout, each result
written on its own. A broken platform shows an error on its own card while keeping its
last-known values; it never blanks the popup.

A parser that no longer recognises a response throws `ScrapeError`, surfaced as
"format changed — parser needs updating". **A silently wrong number reads as lost
progress and is worse than a visible error**, so no adapter falls back to zero.

The three error kinds (`handle-not-found`, `scrape-failed`, `fetch-failed`) are stored
on the snapshot, not flattened to a string, so each gets the remedy that actually fixes
it: a link to settings for a bad username, a per-platform Retry for a network fault,
and no false hope for a broken parser.

## Charts

The chart palette is the validated data-viz palette, **not** the platform brand colors:
run through the palette validator, CodeChef's brown fails the chroma floor (0.037 — it
reads gray) and LeetCode's orange falls outside the lightness band. Brand colors stay
on the card accent stripes, which are decoration rather than data encoding.

All ratings share **one** y-axis. Series colors are bound to the platform, never to
position, so hiding one never repaints the others.

**Easy / Medium / Hard is an ordinal ramp, not three hues.** Swapping the order changes
the meaning, so it takes one hue with monotone lightness — the reader sees the order in
the colour. The previous green/amber/red was a rainbow over ordered data and doubled as
the reserved status palette. The steps are validated with `--ordinal` against this
project's own card surfaces, which is why they are not the documented ramp's defaults:
the light end had to move a step darker to clear the 2:1 floor on `#f7f8fa`.

```bash
npm run preview:charts   # writes preview/charts.html
```

The preview stamps both themes side by side and includes the awkward cases — a flat
sparkline, one with too little history to plot, a zero-count difficulty bar, and a goal
ring overshot past 100%. It earns its keep: in v1 it caught a multi-child SVG `<title>`
that browsers render as literal markup, and this round it caught raw floats reaching
the sparkline caption.

## Development

```bash
npm test           # 129 tests
npm run typecheck
npm run build
node scripts/make-icons.mjs   # only when the icon design changes
```

Adapter tests run against **real captured API responses** in
`src/platforms/__fixtures__/`. Those fixtures are the canary: when a platform changes
shape, re-capture the fixture and the diff shows exactly what moved. The Codeforces
contest fixture is trimmed to eight entries spanning both phases — the live response
carries ~2,100 contests and shape is what the test needs.

Storage is at **schema v2**. Every migration step so far is additive, so one merge
covers v0, v1 and v2; `migrate()` becomes a version-branched chain only when some
future version has to reshape data rather than add to it.

## Politeness and terms

Default refresh is hourly, with a 15-minute floor, and platforms are staggered rather
than fetched all at once. Contests are refetched at most every six hours. Every endpoint
reads *public* profile data with no authentication and stores no credentials.
Automated-access rules vary by site — worth re-reading each platform's terms before any
Chrome Web Store listing.

`notifications` is requested for the daily reminder only, and nothing calls it while the
reminder is off.

## MV3 details worth knowing before editing

- **No inline `<head>` script**, so the theme cannot be resolved from `chrome.storage`
  before first paint. `ui/theme.ts` keeps a synchronous `localStorage` mirror of the
  preference and stamps `data-theme` at import time; `chrome.storage` stays canonical.
- **Alarms replay after downtime.** Chrome fires alarms it missed while the browser was
  closed, so the reminder re-checks the wall clock at fire time — otherwise a laptop
  opened at 3am gets an evening nudge.
- **The badge only recomputes on refresh**, so after midnight it carries yesterday's
  number for at most one interval. Correcting that would mean an alarm firing every
  midnight for a purely cosmetic gain.

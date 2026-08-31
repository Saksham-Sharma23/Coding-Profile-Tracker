# Architecture and engineering notes

Design decisions, platform quirks and the reasoning behind them. Split out of the
README, which is for people who want to *use* the extension.

---

## How it gets the data

The five platforms cooperate to very different degrees. Each is one self-contained
adapter behind a shared interface, so a change to one cannot affect the others.

| Platform | Source | Notes |
|---|---|---|
| Codeforces | Official REST API | Documented and stable. Unknown handles return **HTTP 400** carrying a `status: "FAILED"` envelope. Rate limited to ~1 req/sec, so its calls are sequenced. |
| LeetCode | Public GraphQL, no auth | Unknown users return **HTTP 200** with `matchedUser: null`. `submissionCalendar` is a JSON *string* needing a second parse; contest rating is a float and is rounded. |
| HackerRank | Undocumented JSON | `/rest/hackers/{h}/badges` + `/rest/contests/master/hackers/{h}/profile`. 404s for unknown users. No stability guarantee. |
| GeeksforGeeks | `authapi.geeksforgeeks.org` JSON | Profile pages are Next.js RSC streams with no embedded JSON, but the auth API returns the same numbers cleanly. Unknown handles return 400 with an **empty body**. |
| CodeChef | HTML scrape | The only scraper. Unknown users get the **generic landing page with HTTP 200**, so the page is classified by its profile shell and `<title>` — see below. |

CodeChef needs one more note, because getting it wrong cost real debugging time. Page
existence is decided by the profile shell (`.user-profile-container`) and the
`"CodeChef User Profile"` title, **not** by whether a rating was found. An account that
has never entered a rated contest has no rating block at all, and inferring existence
from the rating reported those users as nonexistent — pointing the blame at a username
that was perfectly correct. Anything unrecognisable now reports itself as unrecognisable,
quoting the page title and byte count, rather than guessing at "no such user".

CodeChef also renders **two** rating blocks — the classic rating in `#rating-block-all`
and a separate DSA rating in `#rating-block-dsa-monday`, whose numbers are unrelated (a
3355-rated account reads `NA` with a highest of 0 in the second). Every rating query is
scoped to the first. An unscoped `.rating-number` lookup finds the right one only
because it happens to be emitted first.

### Which problems, not just how many

Two platforms will say what you actually solved, and both come free of extra requests:

| Platform | Source | Coverage |
|---|---|---|
| Codeforces | `user.status`, **already fetched** for the solve count | Complete history. The response carries problem name, rating and tags, all of which the adapter used to parse away. |
| LeetCode | `recentAcSubmissionList`, one more field on the existing GraphQL query | **The 20 most recent, and only 20** — asking for 50, 100 or 500 all return 20. |

That cap is why the stored list is **merged, never replaced**: a replace would shrink
LeetCode to 20 entries on every refresh and discard everything accumulated since
install. So LeetCode backfills 20 at install and grows forward from there, while
Codeforces is complete from the first refresh. The UI names the platforms that
contribute nothing rather than letting a short list look like a bug.

CodeChef, GeeksforGeeks and HackerRank publish no per-problem feed. CodeChef lists
problem codes on its profile page, but that is the fragile scraper tier and was left
alone deliberately.

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
- **LeetCode's streak is derived, not read.** `userCalendar.streak` is not a current
  streak: queried without a `year` argument, LeetCode scopes it to the current calendar
  year and reports the best run *within* it. So it never falls back to 0 when the user
  stops solving — it sticks at the year's best, which is why the UI reported a fixed
  "7 days" indefinitely — and it collapses every January 1st regardless of a streak
  actually in flight. `currentStreak()` walks the submission calendar back from today
  instead, off data already fetched. A day still in progress does not end a streak, so
  counting starts at yesterday when today is empty. GeeksforGeeks is left as-is: its
  `pod_solved_current_streak` genuinely is a current streak.
- **A hand-kept counter never counts as a fetch.** Its snapshot is marked `manual`, so
  clicking `+1` cannot convince the popup that five hours-old platforms are fresh, and
  the dashboard's "Fetched 2m ago" never describes something that was typed rather than
  fetched.
- **A missing day means different things for a counter and a fetch.** For a fetched
  platform, no history point for yesterday means "we did not look", which is unknowable
  and stays flagged. For a counter it means the count did not move — so it falls back
  to the last value on record, never to `0`, which would report a standing count of 191
  as 191 problems solved today.

## Architecture

```
src/
  background/      service worker: alarms, refresh orchestration, badge, reminder, GitHub
  platforms/       one adapter per site + the shared PlatformAdapter contract
  github/          GitHub sync: auth, REST client, repo layout, rendering, push queue
  shared/          derived numbers used by both the UI and the service worker
  offscreen/       DOM parsing host (service workers have no DOMParser)
  storage/         versioned schema, migrations, typed repo
  ui/              popup, dashboard shell + views + settings, shared components, tokens
  ui/viz/          hand-rolled SVG charts
  content/         username auto-detect, and LeetCode submission capture
scripts/
  make-icons.mjs   draws the icon set (no raster dependency)
```

`shared/` exists so the popup's "solved today" and the toolbar badge's number come from
the same function and cannot disagree.

The popup renders `PlatformRow` (collapsible), the dashboard renders `PlatformCard`
(grid). Both compose the same leaves — `StatBlock`, `Delta`, `Sparkline`,
`DifficultyBar`, `PlatformError` — so a change lands on both at once.

Adding a sixth built-in platform is a new file in `platforms/` plus one line in
`platforms/registry.ts`. User-defined platforms take a different route: a descriptor in
`settings.custom` becomes an adapter through `platforms/custom/adapter.ts`, so
everything downstream — the popup, the badge, the reminder, the storage layer — cannot
tell it from a built-in.

The dashboard and the options page are **one component with two entry points**.
`options_page` has to name a real declared page and cannot carry a URL hash, so
`ui/options/main.tsx` renders the dashboard shell with `initialView="settings"` instead
of redirecting. `chrome.runtime.openOptionsPage()` therefore lands somewhere with the
sidebar and every other view one click away.

Two MV3 constraints shape the design:

1. **Service workers have no `DOMParser`**, so CodeChef's HTML round-trips through an
   offscreen document.
2. **Service workers are torn down after ~30s idle**, so scheduling uses
   `chrome.alarms` (never `setInterval`) and nothing is cached in module scope.

### Writes are serialized, not merely re-read

`updateState` and `updateGithubState` chain every mutation onto a module-scope promise.
Both rewrite the *whole* blob and both `await` between reading and writing, so two
overlapping callers otherwise read the same "before" state and the second write silently
discards the first. `refreshAll` fans adapters out through `Promise.all`, and the 400ms
stagger only spaces out request *starts* — responses land together routinely, so this was
losing snapshots, history points and solved lists in ordinary use.

The chain is per-context, which is the honest limit of it: a UI page and the service
worker still write independently, and `chrome.storage.onChanged` is what reconciles those.
A mutation that throws is chained through `.catch` so one failure cannot wedge the rest.

### GitHub sync

The only outbound path in the extension, added in 1.5.0. Four decisions carry it.

**Capture reads an API, not the DOM.** An obvious implementation patches `window.fetch`
in the `MAIN` world to watch for the submission response. This instead polls LeetCode's
own `recentAcSubmissionList` for submission *ids*, then fetches `submissionDetails` for
the new ones. Slower to notice a solve — a URL-change trigger plus a 60s heartbeat, not
an instant hook — but a LeetCode redesign cannot break it, and nothing is injected into
the page.

**Capture runs in the content script because of cookies.** `submissionDetails` is
owner-only: it returns your code only for a request carrying your session. A content
script on leetcode.com fetching leetcode.com is same-origin, so the cookie and CSRF token
come along. The identical call from the service worker is anonymous and returns null.
The content script asks the worker whether GitHub is connected *before* doing anything,
so an unconfigured extension makes no extra requests at all.

**The token lives outside `TrackerState`.** Settings exports the whole tracker blob to a
plaintext download, so a token stored there would ride along into every backup. It is
kept under its own `github` storage key instead, and `github/storage.test.ts` asserts the
export cannot contain it. This is enforcement, not convention.

**Commits go through the Git Data API, not the Contents API.** A problem is three or four
files; `PUT /contents` would make that three or four commits. Blobs → one tree on the
current head → one commit → move the ref, so history reads as one commit per problem
solved. Pushes are strictly serialized: concurrent writes to one branch produce nothing
but 409s, and GitHub's secondary limit asks for roughly one content-creating request per
second.

The repo's own `.tracker/manifest.json` — not this browser profile — is the source of
truth for what has been pushed. It is read on every push and when a repository is chosen,
so a reinstall or a second machine resumes rather than re-committing everything.

Retries are typed rather than uniform: an auth failure clears the token and stops (keeping
the queue, so reconnecting resumes it), a rate limit waits exactly as long as GitHub
asked, a ref conflict retries promptly because rebuilding on the new head is the fix, and
anything else escalates through a backoff schedule. `chrome.alarms` carries a backoff
across the worker's teardown.

One incidental win: the capture path already fetches the question to write the README, so
it backfills difficulty and topic tags onto LeetCode problems in the dashboard — data the
profile API alone never returns.

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
npm test           # 440 tests
npm run typecheck
npm run build
node scripts/make-icons.mjs   # only when the icon design changes
```

Two test details worth knowing, both of which hid a shipped bug:

- **`mockChromeStorage` takes a `latencyMs`.** With a synchronous storage stub a
  read-modify-write cycle can never interleave, so a lost-update bug is structurally
  invisible. `storage/repo.concurrency.test.ts` runs against a stub with real IPC latency
  and fails outright without the write serialization in `updateState`.
- **The LeetCode fixture is an inactive account** (`streak: 0`, empty calendar), so
  streak behaviour needs synthetic payloads — a fixture alone cannot exercise it.

Adapter tests run against **real captured API responses** in
`src/platforms/__fixtures__/`. Those fixtures are the canary: when a platform changes
shape, re-capture the fixture and the diff shows exactly what moved. The Codeforces
contest fixture is trimmed to eight entries spanning both phases — the live response
carries ~2,100 contests and shape is what the test needs.

Fixtures use public reference accounts (`neal_wu`, `tourist`), never the maintainer's
own profile — a fixture is committed to a public repo, and a personal solve history has
no business being in one. Where a real capture cannot exercise a path (the reference
LeetCode account is inactive, so its recent-submissions list is empty), the test builds
a synthetic payload in the shape verified live.

Storage is at **schema v6**. Every migration step so far is additive, so one merge
covers v0 through v6; `migrate()` becomes a version-branched chain only when some
future version has to reshape data rather than add to it.


## The side panel

Two Chrome facts shape it, both verified rather than assumed:

1. **`action.default_popup` overrides `setPanelBehavior({openPanelOnActionClick: true})`.**
   The toolbar icon opens the popup or the panel, never both, and the API docs do not
   say so. Which one is `settings.iconOpens`, applied at runtime by
   `background/icon-behavior.ts` through `chrome.action.setPopup()`.
2. **The panel's minimum width is 320px**, hard-coded in Chromium as
   `kMinSidePanelContentsWidth`, with no flag and no extension override. There is no API
   to set or even read a preferred width.

That second number decides the content. The popup is built for 380px and `PlatformRow`
is fluid with no min-width, so the panel reuses the popup's leaves directly. The
dashboard could not: `.viz-plot svg` carries `min-width: 420px` inside a horizontal
scroller, so the rating chart and the solved-problems table would both scroll sideways —
tolerable as an overflow case, wrong for a primary surface.

**`chrome.action.setPopup` does not survive a browser restart.** It is a runtime
override of the manifest's `default_popup`, so `restoreIconBehavior()` runs from
`onStartup` as well as `onInstalled`. Without that call the preference silently reverts
every morning, which looks exactly like the setting failing to save.

`chrome.sidePanel.open()` requires a user gesture, and **any `await` before the call
spends it**. The popup therefore resolves its `windowId` on mount and the click handler
calls `open()` as its first statement — the same trap as `chrome.permissions.request()`.

### Reacting to the current site, without the `tabs` permission

`chrome.tabs.query` works without `tabs`; Chrome simply omits `url` unless the extension
holds a host permission for that tab. Since the only grants are the five tracked sites,
every other page arrives as `undefined` and the panel is structurally incapable of
seeing it. `shared/site-match.ts` maps host to platform, and a test cross-checks that map
against `manifest.host_permissions` so the hand-kept copy cannot drift.

The emphasis this produces — matched platform first, expanded — is **view state and is
never written to storage**. `settings.order` and `settings.expanded` are the popup's
memory too, so persisting either would rewrite the order the user chose in Settings just
because they browsed somewhere. Auto-expand also fires only when the matched platform
*changes*, since an SPA rewrites its URL constantly and re-applying would re-open a row
the user deliberately collapsed.

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

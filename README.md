# Coding Profile Tracker

A Chrome extension that shows your **LeetCode, Codeforces, HackerRank, CodeChef and
GeeksforGeeks** progress in one place — so you stop opening five sites to find out where
you are.

Everything runs in your browser. There is no account, no server and no telemetry: the
extension reads each platform's public profile data directly and keeps it all in local
storage.

[![Latest release](https://img.shields.io/github/v/release/Saksham-Sharma23/Coding-Profile-Tracker)](https://github.com/Saksham-Sharma23/Coding-Profile-Tracker/releases/latest)

<!-- Screenshots go well right here: drop PNGs in docs/ and reference them, e.g.
     ![Dashboard](docs/dashboard.png) -->

## What it does

**Popup** — one collapsible row per platform, under a strip showing what you solved
today against your goal, your streak, and your lifetime total. Rows remember whether you
left them open.

**Dashboard** — a sidebar over four views:

| View | Shows |
|---|---|
| Overview | Today's goal ring, rating chart, submission heatmap |
| Platforms | A card per platform — rating, solve counts, difficulty breakdown, badges |
| Problems | Every problem you've solved, searchable by name, platform or tag |
| Settings | Usernames, goals, reminders, theme, import/export |

The sidebar lists every platform you track and flags a broken one from any view.

**Track your own sheets.** Anything no API will report — Striver's SDE Sheet, NeetCode
150, a book you're working through — can be added as a counter you keep by hand with
`+` / `−`. Each one decides whether it counts toward your cross-platform total, because
curated sheets are lists *of* LeetCode problems and counting both would count the same
work twice.

**Toolbar badge** — today's solve count, visible without opening anything.

**Contest countdown** — the next Codeforces or LeetCode contest, for the platforms you
track.

**Daily reminder** — optional, one notification a day, and only when you're behind.

**Your data, your call** — pause or reorder any platform, switch between light, dark and
system themes, export everything to JSON, import it back, or delete the lot.

## Supported platforms

The five sites cooperate to very different degrees, so it's worth knowing what to expect:

| Platform | Rating | Solve count | Which problems | Streak |
|---|:--:|:--:|:--:|:--:|
| LeetCode | ✅ | ✅ | Last 20, then grows | ✅ |
| Codeforces | ✅ | ✅ | Full history | — |
| CodeChef | ✅ | ✅ | — | — |
| GeeksforGeeks | — | ✅ | — | ✅ |
| HackerRank | — | — | — | — |

A few notes on the gaps, since they're deliberate rather than missing features:

- **LeetCode only returns your 20 most recent solves**, so the problem list starts with
  those and grows as you keep solving. Codeforces returns everything from the first
  refresh.
- **HackerRank reports no solve count.** Its badges overlap each other, so any total
  built from them would double-count. Reporting nothing beats reporting a wrong number.
- **GeeksforGeeks' "score" isn't a rating**, so it isn't charted as one.

## Install

Not on the Chrome Web Store yet, so it's a manual load. You don't need Node or any build
tools for this.

1. Download the `.zip` from the [latest release][releases] and unzip it.
   **Keep the unzipped folder somewhere permanent** — deleting it uninstalls the extension.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

Settings opens automatically — add a username for any platform you want to track, then
hit **Save and refresh**.

Works in any Chromium browser with Manifest V3: Chrome, Edge, Brave, Opera, Arc.

### Two things to expect from a manually loaded extension

- Chrome shows a *"disable developer mode extensions"* prompt on startup. That's normal
  for anything installed outside the Web Store, and it can be dismissed.
- There are no automatic updates. To update, download the next release, unzip it over
  the old folder, and click the reload arrow on the extension's card. **Your usernames
  and history survive** — they live in the browser's storage, not in the folder.

[releases]: https://github.com/Saksham-Sharma23/Coding-Profile-Tracker/releases/latest

## Run from source

Requires Node 22 or newer.

```bash
git clone https://github.com/Saksham-Sharma23/Coding-Profile-Tracker.git
cd Coding-Profile-Tracker
npm install
npm run build
```

Then load the generated `dist/` folder via **Load unpacked**, as in step 2 above.

For development, `npm run dev` runs Vite with hot reload against the same output — edit
a file and the extension picks it up without a manual rebuild.

```bash
npm run dev         # Vite with hot reload
npm test            # unit tests
npm run typecheck   # tsc, no emit
npm run build       # typecheck + production build into dist/
```

`dist/` isn't committed — it's generated files with content-hashed names that would
churn on every diff. Each release ships the built zip instead.

## Privacy

Nothing leaves your machine.

- No account, no sign-in, no server.
- No analytics, no telemetry, no tracking.
- Only public profile data is read, and no credentials are ever stored or sent.
- Everything lives in `chrome.storage.local`, and you can export or delete it from
  Settings at any time.

Requests go out roughly once an hour by default (15 minutes minimum), staggered rather
than fired all at once.

## Contributing

Issues and pull requests are welcome. If a platform changes its page or API and a number
stops updating, that's worth reporting — the adapters are tested against real captured
responses, so a report usually turns into a small, well-scoped fix.

Design decisions, platform quirks and the reasoning behind them live in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

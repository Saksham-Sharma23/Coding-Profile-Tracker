# Coding Profile Tracker

A Chrome extension that shows your **LeetCode, Codeforces, HackerRank, CodeChef and
GeeksforGeeks** progress in one place — so you stop opening five sites to find out where
you are.

Everything runs in your browser. There is no server and no telemetry: the extension reads
each platform's public profile data directly and keeps it all in local storage.

Optionally, it will also commit every accepted LeetCode solution to a GitHub repo of your
own — problem, description and the code that passed. That is off until you turn it on.

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
| Settings | Usernames, goals, reminders, theme, GitHub sync, import/export |

The sidebar lists every platform you track and flags a broken one from any view.

**Track your own sheets.** Anything no API will report — Striver's SDE Sheet, NeetCode
150, a book you're working through — can be added as a counter you keep by hand with
`+` / `−`. Each one decides whether it counts toward your cross-platform total, because
curated sheets are lists *of* LeetCode problems and counting both would count the same
work twice.

**Side panel** — the same rows docked beside whatever you are browsing, so checking
progress or nudging a counter costs no tab and nothing disappears when you click the
page. It surfaces the platform for the site you are on: open a LeetCode problem and
LeetCode's row moves to the top and expands. Usernames, pause switches, the daily goal
and the theme are all editable inside the panel.

You choose what the toolbar icon opens — the popup or the panel — in Settings. Chrome
allows only one of the two, and it defaults to the popup.

**Toolbar badge** — today's solve count, visible without opening anything.

**Contest countdown** — the next Codeforces or LeetCode contest, for the platforms you
track.

**Daily reminder** — optional, one notification a day, and only when you're behind.

**Your data, your call** — pause or reorder any platform, switch between light, dark and
system themes, export everything to JSON, import it back, or delete the lot.

## GitHub sync

Connect a GitHub account in Settings and every accepted LeetCode solution gets committed
to a repository you pick, as one commit per problem:

```
README.md                     index of everything solved, with difficulty and language
leetcode/
  0001-two-sum/
    README.md                 title, difficulty, topics, the problem statement, your stats
    solution.py               the code you submitted, named for the language you used
    NOTES.md                  yours — created once, never overwritten
.tracker/manifest.json        machine-readable index
```

Commits read `[Easy] 1. Two Sum`, with runtime and memory in the body. Re-solving a
problem updates its folder in place instead of adding a duplicate — and if you re-solve in
a different language, the old solution file is removed in the same commit.

### Setting it up

About five minutes, all of it on your own GitHub account. The extension holds no account
of its own and there is no server involved — everything below stays between your browser
and github.com.

**1. Make the repository.**

On GitHub, create a new repository — [github.com/new](https://github.com/new). Call it
whatever you like (`leetcode-solutions` is the usual choice), public or private, and tick
**Add a README file** so it starts with a commit. Nothing else to configure.

> Doing this first is worth it. The extension *can* create the repo for you, but only if
> you connect with the button in step 2b. A token from step 2a usually cannot create
> repositories, only write to existing ones.

**2a. Connect with a token** — the way that works on every build.

1. Go to [Personal access tokens → Fine-grained](https://github.com/settings/personal-access-tokens/new).
2. **Token name**: anything. **Expiration**: your call — you will have to redo this step
   when it lapses.
3. **Repository access** → *Only select repositories* → pick the repo from step 1.
4. **Permissions** → *Repository permissions* → find **Contents** and set it to
   **Read and write**. That is the only permission needed; leave everything else alone.
5. **Generate token**, then copy it. GitHub shows it once.
6. In the extension: **Settings → GitHub sync → paste it into "Or paste a personal access
   token" → Connect with token**.

Chrome will ask permission for the extension to reach github.com. That prompt appears
here and nowhere else — decline it and nothing can be pushed.

**2b. Connect with the button** — only if the build you downloaded has it.

If **Connect with GitHub** is shown, click it instead. A tab opens at
`github.com/login/device`, the extension shows you an eight-character code, you type it
in and approve. No token to create and nothing to copy.

If you only see the token box, this build has no OAuth client ID configured — use 2a.
(Building it yourself? See `src/github/config.ts`.)

**3. Choose the repository.**

Click **Choose repository**. The dropdown lists the repos your connection can write to —
with a fine-grained token that is exactly the one you picked in step 1. Select it. The
line underneath should confirm what is already in there.

**4. Turn on pushing.**

Tick **Push accepted solutions automatically**. It stays disabled until a repository is
chosen, so there is no way to switch it on with nowhere to send things.

**5. Check it works.**

Make sure you are **signed in to leetcode.com**, then solve anything — an easy one is
fine. Within a minute or so a commit appears in your repo, and the push log at the bottom
of the GitHub sync settings lists it with a link straight to the commit.

If nothing shows up, that log is the place to look: failures appear there with the reason,
and a **Try now** button appears whenever something is waiting.

### Things worth knowing before you switch it on

- Solutions are captured **while you are signed in to leetcode.com** — that is what makes
  your own submitted code readable. Nothing is captured from a logged-out browser.
- Only submissions made **after** you connect are pushed. There is no backfill: LeetCode
  exposes just the 20 most recent accepted submissions, so a full history is not there to
  fetch.
- **LeetCode only.** The other four platforms don't expose submitted source code.
- Pushes are queued and retried, so a dropped connection means a delay rather than a lost
  solution. Settings shows the queue and the recent push log, failures included.
- Turning it on adds difficulty and topic tags to your LeetCode problems in the dashboard,
  which the profile API alone never provides.
- Changing the repository later re-reads what that repo already contains, so switching
  does not re-commit everything on top of itself.

### When it doesn't work

| What you see | What it means |
|---|---|
| Nothing is pushed at all | Not signed in to leetcode.com, or auto-push is off. Solutions are read from a signed-in LeetCode tab — that is the only way your own submitted code is readable. |
| *"GitHub refused the request"* after **Create** | A fine-grained token generally cannot create repositories. Make it on github.com and pick it from the dropdown instead. |
| *"GitHub rejected the token"* | It expired, or was revoked. Reconnect with a new one — anything queued resumes rather than being lost. |
| The repository dropdown is empty | The connection has write access to nothing. Check the token's **Contents: Read and write** permission and that the right repo is selected under *Repository access*. |
| A push is stuck | The log shows the reason. Rate limits and dropped connections retry on their own; **Try now** forces it immediately. |

## Supported platforms

The five sites cooperate to very different degrees, so it's worth knowing what to expect:

| Platform | Rating | Solve count | Which problems | Streak | Push to GitHub |
|---|:--:|:--:|:--:|:--:|:--:|
| LeetCode | ✅ | ✅ | Last 20, then grows | ✅ | ✅ |
| Codeforces | ✅ | ✅ | Full history | — | — |
| CodeChef | ✅ | ✅ | — | — | — |
| GeeksforGeeks | — | ✅ | — | ✅ | — |
| HackerRank | — | — | — | — | — |

A few notes on the gaps, since they're deliberate rather than missing features:

- **LeetCode only returns your 20 most recent solves**, so the problem list starts with
  those and grows as you keep solving. Codeforces returns everything from the first
  refresh.
- **HackerRank reports no solve count.** Its badges overlap each other, so any total
  built from them would double-count. Reporting nothing beats reporting a wrong number.
- **GeeksforGeeks' "score" isn't a rating**, so it isn't charted as one.
- **Only LeetCode can push to GitHub.** It is the one of the five that exposes your own
  submitted source code. Codeforces publishes a full solve history but not the code
  behind it; the other three publish neither.

## Install

Not on the Chrome Web Store yet, so it's a manual load. You don't need Node or any build
tools for this.

1. Download the `.zip` from the [latest release][releases] and unzip it.
   **Keep the unzipped folder somewhere permanent** — deleting it uninstalls the extension.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

Settings opens automatically — add a username for any platform you want to track, then
hit **Save and refresh**.

Works in any Chromium browser with Manifest V3: Chrome, Edge, Brave, Opera, Arc. The
side panel additionally needs Chrome 116 or newer; on older builds the extension hides
that option rather than offering a switch that does nothing.

### Two things to expect from a manually loaded extension

- Chrome shows a *"disable developer mode extensions"* prompt on startup. That's normal
  for anything installed outside the Web Store, and it can be dismissed.
- There are no automatic updates. To update, download the next release, unzip it over
  the old folder, and click the reload arrow on the extension's card. **Your usernames
  and history survive** — they live in the browser's storage, not in the folder.

Every earlier version stays downloadable on the [releases page][all-releases] — handy
if a new one misbehaves and you want to drop back.

[releases]: https://github.com/Saksham-Sharma23/Coding-Profile-Tracker/releases/latest
[all-releases]: https://github.com/Saksham-Sharma23/Coding-Profile-Tracker/releases

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

**By default, nothing leaves your machine.** GitHub sync is the single exception, and it
is off until you deliberately turn it on.

- No analytics, no telemetry, no tracking — ever, connected or not.
- No server of ours in any configuration. With GitHub connected, the extension talks to
  github.com directly.
- Without GitHub connected: only public profile data is read, no account, no sign-in.
- GitHub's permissions are **not** requested at install. They are asked for at the moment
  you connect, so if you never connect, you are never asked.
- The LeetCode content script reads your username, and — only once you have connected
  GitHub *and* switched pushing on — your own accepted submissions. It checks with the
  extension before doing anything, so with GitHub unconfigured it makes no requests at
  all. It never writes to the page.
- Your GitHub token is stored under its own key, separate from everything else, so
  **exporting your data cannot leak it**. There is a test that enforces this.
- The side panel reads the current tab's address to know which platform you are on, and
  it deliberately does **not** request the `tabs` permission. Chrome therefore only ever
  reveals the URL for hosts the extension already has permission for — the five tracked
  sites — so the panel cannot see anything else you browse, even in principle.
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

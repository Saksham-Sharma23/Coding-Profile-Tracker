## What's new in 0.4.0

**A side panel.** The tracker can now dock beside whatever you are browsing instead of
living in a tab you open and close. It shows the same rows as the popup — with the
hand-kept counters — and stays put when you click the page, which the popup never could.

It also follows you: open a LeetCode problem and LeetCode's row moves to the top and
expands. That needs no new access. The extension deliberately does **not** request the
`tabs` permission, so Chrome only ever tells it the address of the five sites it already
had permission for — it cannot see anything else you browse, even in principle.

Usernames, pause switches, the daily goal and the theme are all editable inside the
panel, so the small changes stop costing a tab.

**You choose what the toolbar icon opens** — the popup or the side panel — under
Settings › Appearance. Chrome allows the icon only one of the two. It stays on the popup
unless you change it, and either surface has a button to reach the other.

Needs Chrome 116 or newer for the panel; on older builds the option is hidden rather
than shown as a switch that does nothing.

## Install

1. Download the `.zip` below and unzip it. **Keep the unzipped folder somewhere
   permanent** — deleting it uninstalls the extension.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

Settings opens automatically — add a username for any platform you want tracked.
To dock the tracker beside your browsing, open the popup and click **Open side
panel**, or set the toolbar icon to open it directly under Settings › Appearance.

Works in Chrome, Edge, Brave, Opera and Arc.

### Expect two things from a manually loaded extension

- Chrome shows a "disable developer mode extensions" prompt on startup. That is normal
  for anything installed outside the Web Store, and can be dismissed.
- There are no automatic updates. To update, download the next release, unzip it over
  the old folder, and click the reload arrow on the extension's card at
  `chrome://extensions`. Your usernames and history are kept — they live in the
  browser's own storage, not in the folder.

### What it can see

Nothing leaves your machine. There is no account and no server: the extension reads the
public profile pages of the platforms you configure, directly from your browser, and
keeps everything in local storage. Export or delete it all from the Settings view at any
time.

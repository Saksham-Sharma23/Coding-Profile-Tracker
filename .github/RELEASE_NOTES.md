## What's new in 0.3.0

**Track anything, not just the five built-in sites.** Add your own platform for
progress no API will ever report — Striver's SDE Sheet, NeetCode 150, a book you are
working through — and keep the count by hand with `+`/`−` from the popup or the
dashboard. Each one chooses whether it counts toward your cross-platform total, because
curated sheets are lists *of* LeetCode problems and counting both counts the same work
twice.

**A real dashboard.** A sidebar over four views — Overview, Platforms, Problems and
Settings — instead of one long scroll with the platform cards stranded at the bottom.
Settings moved in, so there is no separate tab any more, and the rail lists every
tracked platform and flags a broken one from any view.

**CodeChef fixes.** Two, both of which produced confidently wrong answers:

- An account that has never entered a rated contest has no rating block, and the
  extension used the rating to decide whether the account existed at all. Real users
  were reported as "no such user", pointing the blame at a username that was correct.
  Page existence is now decided by the profile page itself, and anything unrecognisable
  says so rather than guessing.
- CodeChef renders two rating blocks now — the classic rating and a separate DSA rating
  whose numbers are unrelated. The extension read whichever came first. It now reads the
  right one.

Also: the popup's auto-refresh can no longer be suppressed by clicking `+1` on a
hand-kept counter, and "solved today" now distinguishes a day you did not move a counter
from a day the extension did not manage to look.

## Install

1. Download the `.zip` below and unzip it. **Keep the unzipped folder somewhere
   permanent** — deleting it uninstalls the extension.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

Settings opens automatically — add a username for any platform you want tracked.

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

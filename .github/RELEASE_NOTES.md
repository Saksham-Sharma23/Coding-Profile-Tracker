## What's new in 1.5.0

**Your solutions, committed to GitHub.** Connect a GitHub account and every accepted
LeetCode solution is pushed to a repository you choose — the problem, its description, and
the code you actually submitted — as one commit per problem.

```
README.md                     index of everything solved, with difficulty and language
leetcode/
  0001-two-sum/
    README.md                 title, difficulty, topics, the problem statement, your stats
    solution.py               the code you submitted, named for the language you used
    NOTES.md                  yours — created once, never overwritten
```

Commits read `[Easy] 1. Two Sum`, with runtime and memory in the body. Re-solving updates
the folder in place instead of adding a duplicate, and re-solving in a different language
removes the old solution file in the same commit — so you never end up with two competing
answers side by side.

Connect either by clicking **Connect with GitHub** and approving an eight-character code,
or by pasting a fine-grained personal access token limited to the single repository. Both
put the credential in your browser and nowhere else.

**This is off until you turn it on.** It is also the first version of this extension that
can send anything anywhere, so it is worth being plain about what changed — see *What it
can see* below.

**LeetCode problems now carry difficulty and topic tags.** A side effect of the above: the
capture path already reads the question, so the dashboard's Problems view finally shows
Easy/Medium/Hard and topics for LeetCode, which the profile API alone has never returned.

## Install

1. Download the `.zip` below and unzip it. **Keep the unzipped folder somewhere
   permanent** — deleting it uninstalls the extension.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

Settings opens automatically — add a username for any platform you want tracked.
To dock the tracker beside your browsing, open the popup and click **Open side
panel**, or set the toolbar icon to open it directly under Settings › Appearance.

Works in Chrome, Edge, Brave, Opera and Arc.

## Setting up GitHub sync

Roughly five minutes, all of it on your own GitHub account.

1. **Create the repository** at [github.com/new](https://github.com/new) — any name,
   public or private, and tick *Add a README file* so it starts with a commit.
2. **Connect**, in Settings › GitHub sync, either way:
   - **Connect with GitHub** — a tab opens at `github.com/login/device`, you type the code
     shown in the extension and approve. Nothing to copy.
   - **A token** — at
     [Personal access tokens → Fine-grained](https://github.com/settings/personal-access-tokens/new),
     set *Repository access* to only the repo from step 1, and under *Repository
     permissions* set **Contents** to **Read and write**. That is the only permission
     needed. Paste it into the extension.
3. **Choose the repository** from the dropdown.
4. **Tick "Push accepted solutions automatically."** It stays disabled until a repository
   is chosen.
5. Make sure you are **signed in to leetcode.com**, then solve something. The commit
   appears within a minute, and the push log at the bottom of the settings links to it.

Worth knowing: solutions are read from a signed-in LeetCode tab, which is what makes your
own submitted code readable at all. Only submissions made *after* you connect are pushed —
LeetCode exposes just the 20 most recent, so there is no full history to backfill. LeetCode
is the only one of the five platforms that exposes submitted source code.

### Expect two things from a manually loaded extension

- Chrome shows a "disable developer mode extensions" prompt on startup. That is normal
  for anything installed outside the Web Store, and can be dismissed.
- There are no automatic updates. To update, download the next release, unzip it over
  the old folder, and click the reload arrow on the extension's card at
  `chrome://extensions`. Your usernames and history are kept — they live in the
  browser's own storage, not in the folder.

### What it can see

**By default, nothing leaves your machine.** There is no account and no server: the
extension reads the public profile pages of the platforms you configure, directly from
your browser, and keeps everything in local storage.

GitHub sync is the single exception, and only once you switch it on:

- **Its permissions are not requested at install.** Chrome asks for access to github.com
  at the moment you connect, and never if you don't.
- **There is still no server of ours.** With sync on, the extension talks to github.com
  directly. Your token and your code never pass through anything of ours.
- **Only LeetCode is read for this**, and only while you are signed in there. The content
  script asks the extension whether sync is on before making any request, so with GitHub
  unconfigured it does nothing at all.
- **Your GitHub token is stored apart from everything else**, so exporting your data
  cannot leak it.
- No analytics, no telemetry, no tracking — connected or not.

Export or delete everything from the Settings view at any time. Revoking access on
GitHub's side — under Settings › Applications, or by deleting the token — stops pushing
immediately.

## What's new in 1.6.0

A maintenance release. No new features — three things that were reporting
the wrong number, and a data-loss bug behind them.

**Your streak was wrong.** LeetCode's API reports the best run *within the current
calendar year*, not a live streak — so it never dropped back to zero when you stopped
solving, and sat at a fixed number indefinitely. The streak is now counted from your
submission calendar, so it falls to 0 when a day passes with nothing, and survives
January 1st.

**"Solved today" showed "—" on your first day.** It was measured as the change since
yesterday, so a fresh install had nothing to compare against — even with a problem
solved and listed right below it. Where a platform says *which* problems you solved
(LeetCode, Codeforces) it now counts those directly, correct from the first day.
CodeChef, GeeksforGeeks and HackerRank publish only totals, so those still need a day
of history.

**Refreshes could lose data.** Platforms refresh in parallel and each wrote the whole
stored blob, so two finishing at the same moment meant the slower one's snapshot,
history point and solved list were silently discarded. Writes are now serialized.
Same fix applied to GitHub sync state.

**GitHub sync fixes.** A push that gave up after six attempts left the solution
unpushable forever — re-solving the problem was the only way back. Re-solving no
longer resets the retry counter (which meant a failing push retried silently
forever), and changing repository mid-backlog no longer sends the rest to the old one.

**Also fixed.** A reminder set to 23:00 could never fire from a catch-up, and reminders
drifted an hour across daylight saving. Importing a backup with more than 20 custom
platforms silently deleted the extras from storage on the next read.

Your usernames, history and hand-kept counts carry over untouched.

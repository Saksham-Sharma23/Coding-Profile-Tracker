import { beforeEach, describe, expect, it } from 'vitest';
import type { PlatformStats, SolvedProblem } from '@/platforms/types';
import {
  changedHandles,
  clearPlatformData,
  hasStoredData,
  readState,
  recordSuccess,
  saveSettings,
  updateState,
} from './repo';
import { mockChromeStorage } from '@/test/chrome-storage';
import { defaultState, type TrackerState } from './schema';

const problem = (key: string, solvedAt: number): SolvedProblem => ({
  key,
  name: key,
  url: `https://leetcode.com/problems/${key}/`,
  solvedAt,
});

const statsFor = (handle: string, total: number, solvedProblems: SolvedProblem[]): PlatformStats => ({
  platform: 'leetcode',
  handle,
  fetchedAt: Date.parse('2026-08-12T10:00:00Z'),
  headline: [{ label: 'Solved', value: total, delta: 'solved' }],
  solved: { total },
  solvedProblems,
});

/** Seeds storage as if `handle` had been tracked for a while. */
async function seed(handle: string): Promise<void> {
  await updateState((state) => {
    state.settings.handles = { leetcode: handle, codeforces: 'tourist' };
    state.snapshots.leetcode = {
      status: 'ok',
      fetchedAt: 1,
      stats: statsFor(handle, 300, []),
    };
    state.history.leetcode = [{ d: '2026-08-01', solved: 300 }];
    state.solved.leetcode = [problem('two-sum', 500), problem('add-two-numbers', 400)];
    state.history.codeforces = [{ d: '2026-08-01', rating: 1500 }];
    state.solved.codeforces = [problem('1-A', 100)];
  });
}

beforeEach(mockChromeStorage);

describe('changedHandles', () => {
  it('ignores case and surrounding whitespace', () => {
    // Codeforces handles genuinely are case-insensitive, and a false positive here
    // would delete real history just for retyping a name differently.
    expect(changedHandles({ codeforces: 'tourist' }, { codeforces: 'Tourist' })).toEqual([]);
    expect(changedHandles({ leetcode: 'neal_wu' }, { leetcode: '  neal_wu  ' })).toEqual([]);
  });

  it('reports a real change, an addition and a removal', () => {
    expect(changedHandles({ leetcode: 'a' }, { leetcode: 'b' })).toEqual(['leetcode']);
    expect(changedHandles({}, { leetcode: 'a' })).toEqual(['leetcode']);
    // A cleared handle orphans its data just as surely as a swapped one.
    expect(changedHandles({ leetcode: 'a' }, {})).toEqual(['leetcode']);
  });

  it('does not flag platforms that stayed put', () => {
    expect(changedHandles({ leetcode: 'a', codeforces: 'b' }, { leetcode: 'z', codeforces: 'b' })).toEqual(
      ['leetcode'],
    );
  });
});

describe('clearPlatformData', () => {
  it('drops every accumulated bag for one platform and no other', () => {
    const state: TrackerState = defaultState();
    state.snapshots.leetcode = { status: 'ok', fetchedAt: 1 };
    state.history.leetcode = [{ d: '2026-08-01', solved: 10 }];
    state.solved.leetcode = [problem('two-sum', 1)];
    state.history.codeforces = [{ d: '2026-08-01', rating: 1500 }];

    clearPlatformData(state, 'leetcode');

    expect(state.snapshots.leetcode).toBeUndefined();
    expect(state.history.leetcode).toBeUndefined();
    expect(state.solved.leetcode).toBeUndefined();
    expect(state.history.codeforces).toHaveLength(1);
  });

  it('leaves the handle and enabled flag alone, since the platform is still tracked', () => {
    const state = defaultState();
    state.settings.handles.leetcode = 'neal_wu';
    state.settings.enabled.leetcode = true;
    clearPlatformData(state, 'leetcode');
    expect(state.settings.handles.leetcode).toBe('neal_wu');
    expect(state.settings.enabled.leetcode).toBe(true);
  });
});

describe('hasStoredData', () => {
  it('is false for an untouched platform and true once anything lands', () => {
    const state = defaultState();
    expect(hasStoredData(state, 'leetcode')).toBe(false);
    state.solved.leetcode = [];
    expect(hasStoredData(state, 'leetcode')).toBe(false);
    state.solved.leetcode = [problem('two-sum', 1)];
    expect(hasStoredData(state, 'leetcode')).toBe(true);
  });
});

describe('saveSettings — handle change', () => {
  it('discards the previous account’s data', async () => {
    await seed('neal_wu');
    await saveSettings({ handles: { leetcode: 'someone_else', codeforces: 'tourist' } });

    const state = await readState();
    expect(state.solved.leetcode).toBeUndefined();
    expect(state.history.leetcode).toBeUndefined();
    expect(state.snapshots.leetcode).toBeUndefined();
    expect(state.settings.handles.leetcode).toBe('someone_else');

    // The platform that did not change keeps everything.
    expect(state.solved.codeforces).toHaveLength(1);
    expect(state.history.codeforces).toHaveLength(1);
  });

  it('keeps data when the handle is merely retyped in a different case', async () => {
    await seed('neal_wu');
    await saveSettings({ handles: { leetcode: 'Neal_Wu', codeforces: 'tourist' } });

    const state = await readState();
    expect(state.solved.leetcode).toHaveLength(2);
    expect(state.history.leetcode).toHaveLength(1);
  });

  it('touches nothing when the save carries no handles at all', async () => {
    await seed('neal_wu');
    await saveSettings({ theme: 'dark' });

    const state = await readState();
    expect(state.solved.leetcode).toHaveLength(2);
    expect(state.settings.theme).toBe('dark');
  });
});

describe('recordSuccess — account identity', () => {
  it('never blends two accounts’ solved lists', async () => {
    // The reported bug: point the extension at another user, and their fetch merged
    // into the list already stored, so both people's problems showed under one name.
    await seed('neal_wu');
    await recordSuccess(statsFor('someone_else', 42, [problem('valid-parentheses', 900)]));

    const state = await readState();
    const keys = (state.solved.leetcode ?? []).map((each) => each.key);
    expect(keys).toEqual(['valid-parentheses']);
    expect(keys).not.toContain('two-sum');
  });

  it('does not carry the previous account’s history forward as a delta', async () => {
    // Otherwise a 300-problem series continues with the new user's 42 and the UI
    // reports a wild overnight swing that never happened.
    await seed('neal_wu');
    await recordSuccess(statsFor('someone_else', 42, []));

    const state = await readState();
    expect(state.history.leetcode).toEqual([{ d: '2026-08-12', solved: 42 }]);
  });

  it('still accumulates across refreshes for the same account', async () => {
    // The guard must not defeat mergeSolved, which exists because LeetCode only ever
    // returns the 20 most recent solves — replacing would shrink the list every hour.
    await seed('neal_wu');
    await recordSuccess(statsFor('neal_wu', 301, [problem('valid-parentheses', 900)]));

    const state = await readState();
    const keys = (state.solved.leetcode ?? []).map((each) => each.key);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('two-sum');
    expect(keys).toContain('valid-parentheses');
  });

  it('accumulates for the same account across a case difference', async () => {
    await seed('neal_wu');
    await recordSuccess(statsFor('Neal_Wu', 301, [problem('valid-parentheses', 900)]));
    expect((await readState()).solved.leetcode).toHaveLength(3);
  });

  it('keeps a first fetch intact when nothing was stored before', async () => {
    await recordSuccess(statsFor('neal_wu', 10, [problem('two-sum', 500)]));
    expect((await readState()).solved.leetcode).toHaveLength(1);
  });
});

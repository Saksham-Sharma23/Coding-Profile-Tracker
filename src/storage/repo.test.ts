import { describe, expect, it } from 'vitest';
import { pointForDay, previousDay, previousPoint } from './repo';
import {
  clampGoal,
  clampRefresh,
  migrate,
  DEFAULT_REFRESH_MINUTES,
  DEFAULT_REMINDER_HOUR,
  MIN_REFRESH_MINUTES,
  SCHEMA_VERSION,
} from './schema';

describe('migrate', () => {
  it('returns a default state for missing or junk input', () => {
    expect(migrate(undefined).version).toBe(SCHEMA_VERSION);
    expect(migrate('nonsense').settings.handles).toEqual({});
  });

  it('preserves accumulated data from a v0 blob', () => {
    const old = {
      settings: { handles: { leetcode: 'saksh' }, enabled: {}, refreshMinutes: 30 },
      history: { leetcode: [{ d: '2026-01-01', solved: 10 }] },
    };
    const next = migrate(old);
    expect(next.settings.handles.leetcode).toBe('saksh');
    expect(next.history.leetcode).toHaveLength(1);
    expect(next.version).toBe(SCHEMA_VERSION);
  });

  it('carries a v1 blob forward intact and fills in the v2 defaults', () => {
    const v1 = {
      version: 1,
      settings: { handles: { leetcode: 'saksh', codeforces: 'cf' }, enabled: { codechef: false }, refreshMinutes: 120 },
      snapshots: { leetcode: { status: 'ok', fetchedAt: 111, stats: { platform: 'leetcode' } } },
      history: { leetcode: [{ d: '2026-01-01', solved: 10 }, { d: '2026-01-02', solved: 14 }] },
      detected: { codeforces: 'cf' },
    };
    const next = migrate(v1);

    // Nothing the user accumulated is lost.
    expect(next.settings.handles).toEqual({ leetcode: 'saksh', codeforces: 'cf' });
    expect(next.settings.enabled).toEqual({ codechef: false });
    expect(next.settings.refreshMinutes).toBe(120);
    expect(next.snapshots.leetcode?.fetchedAt).toBe(111);
    expect(next.history.leetcode).toHaveLength(2);
    expect(next.detected.codeforces).toBe('cf');

    // And the fields later versions introduced arrive with usable defaults.
    expect(next.version).toBe(SCHEMA_VERSION);
    expect(next.settings.order).toEqual([]);
    expect(next.settings.expanded).toEqual([]);
    expect(next.settings.dailyGoal).toBe(0);
    expect(next.settings.theme).toBe('system');
    expect(next.settings.reminder).toEqual({ enabled: false, hour: DEFAULT_REMINDER_HOUR });
    expect(next.solved).toEqual({});
  });

  it('carries a v2 blob forward and adds the v3 solved-problem bag', () => {
    const v2 = {
      version: 2,
      settings: { handles: { codeforces: 'cf' }, dailyGoal: 3, theme: 'dark' },
      history: { codeforces: [{ d: '2026-08-01', rating: 1400 }] },
    };
    const next = migrate(v2);

    expect(next.version).toBe(SCHEMA_VERSION);
    expect(next.settings.dailyGoal).toBe(3);
    expect(next.settings.theme).toBe('dark');
    expect(next.history.codeforces).toHaveLength(1);
    expect(next.solved).toEqual({});
  });

  it('keeps a stored solved list and drops retired platforms from it', () => {
    const next = migrate({
      solved: {
        codeforces: [{ key: '1-A', name: 'Theatre Square', url: 'x', solvedAt: 5 }],
        topcoder: [{ key: 'z', name: 'Gone', url: 'y', solvedAt: 1 }],
      },
    });
    expect(next.solved.codeforces).toHaveLength(1);
    expect(next.solved).not.toHaveProperty('topcoder');
  });

  it('drops keys for platforms that no longer exist', () => {
    const next = migrate({
      settings: { handles: { leetcode: 'a', topcoder: 'b' }, enabled: {} },
      snapshots: { topcoder: { status: 'ok', fetchedAt: 1 } },
    });
    expect(next.settings.handles).toEqual({ leetcode: 'a' });
    expect(next.snapshots).toEqual({});
  });

  it('scrubs unknown ids and duplicates out of the order and expanded lists', () => {
    const next = migrate({
      settings: { order: ['codeforces', 'topcoder', 'codeforces', 'leetcode'], expanded: ['nope'] },
    });
    expect(next.settings.order).toEqual(['codeforces', 'leetcode']);
    expect(next.settings.expanded).toEqual([]);
  });

  it('rejects an out-of-range or non-integer reminder hour', () => {
    expect(migrate({ settings: { reminder: { enabled: true, hour: 25 } } }).settings.reminder).toEqual({
      enabled: true,
      hour: DEFAULT_REMINDER_HOUR,
    });
    expect(migrate({ settings: { reminder: { enabled: true, hour: 7 } } }).settings.reminder).toEqual({
      enabled: true,
      hour: 7,
    });
    expect(migrate({ settings: { reminder: 'nope' } }).settings.reminder.enabled).toBe(false);
  });

  it('drops contests for platforms that no longer exist', () => {
    const next = migrate({
      contests: {
        fetchedAt: 5,
        items: [
          { platform: 'codeforces', name: 'Div 2', url: 'x', startsAt: 1 },
          { platform: 'topcoder', name: 'SRM', url: 'y', startsAt: 2 },
        ],
      },
    });
    expect(next.contests?.items).toHaveLength(1);
    expect(next.contests?.items[0]?.platform).toBe('codeforces');
  });
});

describe('clampRefresh', () => {
  it('enforces the politeness floor', () => {
    expect(clampRefresh(1)).toBe(MIN_REFRESH_MINUTES);
    expect(clampRefresh(120)).toBe(120);
    expect(clampRefresh('x')).toBe(DEFAULT_REFRESH_MINUTES);
  });
});

describe('clampGoal', () => {
  it('treats anything unusable as no goal', () => {
    expect(clampGoal(0)).toBe(0);
    expect(clampGoal(-4)).toBe(0);
    expect(clampGoal('x')).toBe(0);
    expect(clampGoal(Number.NaN)).toBe(0);
  });

  it('rounds and caps a real goal', () => {
    expect(clampGoal(3.4)).toBe(3);
    expect(clampGoal(9999)).toBe(500);
  });
});

describe('previousPoint', () => {
  const series = [
    { d: '2026-08-01', solved: 10 },
    { d: '2026-08-02', solved: 12 },
    { d: '2026-08-03', solved: 15 },
  ];

  it('finds the most recent point before today', () => {
    expect(previousPoint(series, '2026-08-03')?.solved).toBe(12);
  });

  it('returns undefined when today is the only data point', () => {
    expect(previousPoint([{ d: '2026-08-03', solved: 1 }], '2026-08-03')).toBeUndefined();
    expect(previousPoint([], '2026-08-03')).toBeUndefined();
    expect(previousPoint(undefined, '2026-08-03')).toBeUndefined();
  });
});

describe('previousDay', () => {
  it('steps back one day, including across month and year ends', () => {
    expect(previousDay('2026-08-03')).toBe('2026-08-02');
    expect(previousDay('2026-08-01')).toBe('2026-07-31');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });
});

describe('pointForDay', () => {
  const series = [
    { d: '2026-08-01', solved: 10 },
    { d: '2026-08-04', solved: 15 },
  ];

  it('returns the point for that exact day', () => {
    expect(pointForDay(series, '2026-08-04')?.solved).toBe(15);
    expect(pointForDay(series, '2026-08-01')?.solved).toBe(10);
  });

  it('returns undefined for a day with no point, rather than the nearest one', () => {
    // This is the whole reason it exists: previousPoint would answer 10 here, which
    // would report three days of work as one day's.
    expect(pointForDay(series, '2026-08-03')).toBeUndefined();
    expect(pointForDay(series, '2026-07-31')).toBeUndefined();
    expect(pointForDay(series, '2026-08-05')).toBeUndefined();
    expect(pointForDay(undefined, '2026-08-01')).toBeUndefined();
  });
});

describe('migrate — iconOpens', () => {
  it('defaults to the popup, so an update never changes what a click does', () => {
    expect(migrate(undefined).settings.iconOpens).toBe('popup');
    expect(migrate({ settings: {} }).settings.iconOpens).toBe('popup');
  });

  it('keeps a stored preference', () => {
    expect(migrate({ settings: { iconOpens: 'sidepanel' } }).settings.iconOpens).toBe('sidepanel');
  });

  it('falls back rather than storing junk from an imported file', () => {
    // migrate() is the import trust boundary, and this value is handed straight to
    // chrome.action.setPopup / setPanelBehavior.
    for (const junk of ['SIDEPANEL', 'panel', '', 0, null, {}, ['sidepanel']]) {
      expect(migrate({ settings: { iconOpens: junk } }).settings.iconOpens).toBe('popup');
    }
  });

  it('survives a round trip through migrate', () => {
    const once = migrate({ settings: { iconOpens: 'sidepanel' } });
    expect(migrate(once)).toEqual(once);
  });
});

import { describe, expect, it } from 'vitest';
import {
  atCustomPlatformLimit,
  isCustomId,
  mintCustomId,
  originOf,
  sanitizeCustom,
  MAX_CUSTOM_PLATFORMS,
} from './custom';
import { migrate } from './schema';

const base = {
  id: 'custom:atcoder-7f3a',
  displayName: 'AtCoder',
  accent: '#1f8acb',
  source: 'json' as const,
  urlTemplate: 'https://kenkoooo.com/atcoder/atcoder-api/v3/user/ac_rank?user={handle}',
  fields: { solved: { path: 'count' } },
  countsTowardTotal: true,
  chartRating: false,
};

const one = (patch: Record<string, unknown> = {}) => sanitizeCustom([{ ...base, ...patch }]);

describe('mintCustomId', () => {
  it('slugifies the name behind the reserved prefix', () => {
    expect(mintCustomId('Striver SDE Sheet')).toMatch(/^custom:striver-sde-sheet-[0-9a-f]{4}$/);
    expect(isCustomId(mintCustomId('x'))).toBe(true);
  });

  it('never mints a bare prefix from an unusable name', () => {
    expect(mintCustomId('!!!')).toMatch(/^custom:platform-[0-9a-f]{4}$/);
  });

  it('gives two platforms of the same name different ids', () => {
    // Otherwise deleting and re-adding would silently inherit the old counter.
    const ids = new Set(Array.from({ length: 20 }, () => mintCustomId('Same Name')));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('sanitizeCustom — URL safety', () => {
  it('rejects a javascript: profile URL', () => {
    // This lands in an <a href> on an extension-origin page with full chrome.* access,
    // and can arrive through an imported file someone else wrote.
    expect(one({ profileUrlTemplate: 'javascript:alert(1)' })[0]?.profileUrlTemplate).toBeUndefined();
    expect(one({ profileUrlTemplate: 'JaVaScRiPt:alert(1)' })[0]?.profileUrlTemplate).toBeUndefined();
  });

  it('rejects data:, file: and chrome-extension: URLs', () => {
    for (const url of ['data:text/html,<script>x</script>', 'file:///etc/passwd', 'chrome-extension://abc/x']) {
      expect(one({ profileUrlTemplate: url })[0]?.profileUrlTemplate).toBeUndefined();
    }
  });

  it('refuses cleartext http, so a granted origin can never be plaintext', () => {
    expect(one({ urlTemplate: 'http://example.com/{handle}' })).toEqual([]);
  });

  it('keeps a plain https template', () => {
    expect(one()[0]?.urlTemplate).toBe(base.urlTemplate);
  });
});

describe('sanitizeCustom — descriptor rules', () => {
  it('requires {handle} on a fetched platform', () => {
    expect(one({ urlTemplate: 'https://example.com/fixed' })).toEqual([]);
  });

  it('lets a manual platform omit the endpoint entirely', () => {
    const manual = sanitizeCustom([
      { ...base, id: 'custom:striver-0001', source: 'manual', urlTemplate: undefined, fields: undefined },
    ]);
    expect(manual).toHaveLength(1);
    expect(manual[0]?.source).toBe('manual');
  });

  it('requires a fetched platform to read at least one number', () => {
    expect(one({ fields: undefined })).toEqual([]);
    expect(one({ fields: { globalRank: { path: 'rank' } } })).toEqual([]);
  });

  it('rejects a malformed id, a builtin collision, and a bare name', () => {
    expect(one({ id: 'striver' })).toEqual([]);
    expect(one({ id: 'leetcode' })).toEqual([]);
    expect(one({ id: 'custom:Has Spaces' })).toEqual([]);
    expect(one({ displayName: '   ' })).toEqual([]);
  });

  it('rejects a non-hex accent, since it is interpolated into inline style', () => {
    expect(one({ accent: 'red' })).toEqual([]);
    expect(one({ accent: '#ff' })).toEqual([]);
    expect(one({ accent: '#1f8acb' })).toHaveLength(1);
  });

  it('keeps the first of duplicate ids, so import is idempotent', () => {
    const out = sanitizeCustom([base, { ...base, displayName: 'Impostor' }]);
    expect(out).toHaveLength(1);
    expect(out[0]?.displayName).toBe('AtCoder');
  });

  it('drops one bad descriptor without losing the good ones', () => {
    const out = sanitizeCustom([base, { junk: true }, { ...base, id: 'custom:other-0002' }]);
    expect(out.map((d) => d.id)).toEqual(['custom:atcoder-7f3a', 'custom:other-0002']);
  });

  it('keeps every valid platform rather than truncating to the limit', () => {
    /*
     * sanitizeCustom runs inside migrate(), which runs on every read. Truncating here
     * would not reject an oversized import — it would silently delete the user's own
     * platforms and their hand-kept counts from storage on the next read, permanently.
     * The limit is enforced where a platform is created, which is where it can be
     * explained and refused. See atCustomPlatformLimit().
     */
    const many = Array.from({ length: MAX_CUSTOM_PLATFORMS + 5 }, (_, i) => ({
      ...base,
      id: `custom:p${i}-0000`,
    }));
    expect(sanitizeCustom(many)).toHaveLength(MAX_CUSTOM_PLATFORMS + 5);
  });

  it('reports when the creation limit is reached', () => {
    const at = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...base, id: `custom:p${i}-0000` }));

    expect(atCustomPlatformLimit(sanitizeCustom(at(MAX_CUSTOM_PLATFORMS - 1)))).toBe(false);
    expect(atCustomPlatformLimit(sanitizeCustom(at(MAX_CUSTOM_PLATFORMS)))).toBe(true);
  });

  it('caps display-only extra fields', () => {
    const out = one({ fields: { solved: { path: 'count' }, extra: [1, 2, 3, 4].map((n) => ({ path: `f${n}` })) } });
    expect(out[0]?.fields?.extra).toHaveLength(2);
  });

  it('derives the permission origin from the endpoint', () => {
    expect(one()[0]?.origin).toBe('https://kenkoooo.com/*');
    expect(originOf('https://a.b.example.com/x/{handle}')).toBe('https://a.b.example.com/*');
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizeCustom(undefined)).toEqual([]);
    expect(sanitizeCustom('nope')).toEqual([]);
  });
});

describe('migrate — custom platform survival', () => {
  const withCustom = {
    settings: {
      custom: [base],
      handles: { 'custom:atcoder-7f3a': 'tourist', leetcode: 'saksh' },
      enabled: { 'custom:atcoder-7f3a': true },
      order: ['custom:atcoder-7f3a', 'leetcode'],
      expanded: ['custom:atcoder-7f3a'],
    },
    snapshots: { 'custom:atcoder-7f3a': { status: 'ok', fetchedAt: 5 } },
    history: { 'custom:atcoder-7f3a': [{ d: '2026-08-01', solved: 1057 }] },
    solved: { 'custom:atcoder-7f3a': [{ key: 'a', name: 'A', url: 'u', solvedAt: 1 }] },
  };

  it('keeps a declared custom platform across every bag', () => {
    const next = migrate(withCustom);
    const id = 'custom:atcoder-7f3a';

    expect(next.settings.custom).toHaveLength(1);
    expect(next.settings.handles[id]).toBe('tourist');
    expect(next.settings.enabled[id]).toBe(true);
    expect(next.settings.order).toContain(id);
    expect(next.settings.expanded).toContain(id);
    expect(next.snapshots[id]?.fetchedAt).toBe(5);
    expect(next.history[id]).toHaveLength(1);
    expect(next.solved[id]).toHaveLength(1);
  });

  it('keeps data for an UNDECLARED custom id rather than deleting it', () => {
    // The safety net. If sanitizeCustom ever rejects a descriptor, a strict prune would
    // turn a validation bug into permanent loss of the user's history.
    const next = migrate({
      settings: { custom: [], handles: { 'custom:orphan-0000': 'me' } },
      history: { 'custom:orphan-0000': [{ d: '2026-08-01', solved: 5 }] },
    });
    expect(next.settings.handles['custom:orphan-0000']).toBe('me');
    expect(next.history['custom:orphan-0000']).toHaveLength(1);
  });

  it('still drops a key that was never a platform at all', () => {
    const next = migrate({ settings: { handles: { topcoder: 'x' } }, history: { topcoder: [] } });
    expect(next.settings.handles).toEqual({});
    expect(next.history).toEqual({});
  });

  it('drops an undeclared custom id from order and expanded', () => {
    // Unlike the data bags, these are pure display state — a dangling id there would
    // just be noise, and orderedAdapters ignores it anyway.
    const next = migrate({ settings: { custom: [], order: ['custom:gone-0000', 'leetcode'] } });
    expect(next.settings.order).toEqual(['leetcode']);
  });

  it('is idempotent', () => {
    // Catches a whole class of ordering bugs, since the custom set has to be computed
    // before anything that depends on it.
    const once = migrate(withCustom);
    expect(migrate(once)).toEqual(once);
    expect(migrate(migrate(migrate(withCustom)))).toEqual(once);
  });

  it('survives a hostile blob without throwing', () => {
    const hostile = {
      settings: {
        custom: [
          { ...base, profileUrlTemplate: 'javascript:fetch("//evil")' },
          null,
          42,
          { ...base, id: '__proto__' },
        ],
      },
    };
    const next = migrate(hostile);
    expect(next.settings.custom).toHaveLength(1);
    expect(next.settings.custom[0]?.profileUrlTemplate).toBeUndefined();
  });
});

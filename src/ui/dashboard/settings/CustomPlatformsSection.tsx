import { useState } from 'react';
import type { PlatformId } from '@/platforms/types';
import {
  atCustomPlatformLimit,
  MAX_CUSTOM_PLATFORMS,
  mintCustomId,
  type CustomPlatform,
} from '@/storage/custom';
import { upsertCustomPlatform } from '@/storage/repo';
import { PlusIcon } from '../../icons';
import type { SectionProps } from './types';

/**
 * Accents for user-defined platforms, assigned in rotation so two new counters never
 * look alike by default.
 *
 * These are card stripes, which the design system treats as decoration rather than a
 * data encoding — so unlike the chart palette in viz/tokens.css they carry no contrast
 * obligation. Chosen to sit clear of the five builtin accents (LeetCode's orange,
 * Codeforces' blue, HackerRank's and GeeksforGeeks' greens, CodeChef's brown).
 */
const ACCENTS = ['#7c5cff', '#e0468b', '#0f9b8e', '#c2410c', '#5b7cfa', '#a3721a'];

/** Hand-kept counters: the sheets and trackers no API will ever tell us about. */
export function CustomPlatformsSection({ state, updateSettings, flash }: SectionProps) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [counts, setCounts] = useState(false);
  const [busy, setBusy] = useState(false);

  const existing = state.settings.custom;
  const full = atCustomPlatformLimit(existing);
  const trimmed = name.trim();

  const add = async () => {
    if (!trimmed || full || busy) return;
    setBusy(true);
    try {
      const size = Number(target.trim());
      const def: CustomPlatform = {
        id: mintCustomId(trimmed),
        displayName: trimmed,
        accent: ACCENTS[existing.length % ACCENTS.length]!,
        source: 'manual',
        ...(target.trim() && Number.isFinite(size) && size > 0 && { target: Math.round(size) }),
        countsTowardTotal: counts,
        chartRating: false,
      };

      await upsertCustomPlatform(def);
      // Land it open in the popup, so the counter is one click away immediately rather
      // than hidden behind a collapsed row the user has to go find.
      await updateSettings({ expanded: [...state.settings.expanded, def.id as PlatformId] });

      setName('');
      setTarget('');
      setCounts(false);
      flash(`Added ${def.displayName}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Your own platforms</h2>
      <p className="muted intro">
        For anything no API will tell us about — Striver&apos;s SDE Sheet, NeetCode 150, a
        book you are working through. You keep the count; the extension charts it, tracks
        your daily streak against it and backs it up with everything else.
      </p>

      <section className="settings-row custom-add">
        <label htmlFor="cp-name">Name</label>
        <input
          id="cp-name"
          value={name}
          placeholder="Striver SDE Sheet"
          maxLength={40}
          disabled={full}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
        />

        <label htmlFor="cp-target">Sheet size</label>
        <input
          id="cp-target"
          type="number"
          min={1}
          value={target}
          placeholder="optional"
          disabled={full}
          className="custom-target"
          onChange={(e) => setTarget(e.target.value)}
        />

        <button className="btn-primary" disabled={!trimmed || full || busy} onClick={() => void add()}>
          <PlusIcon size={13} /> Add
        </button>

        <label className="switch-inline custom-counts">
          <input
            type="checkbox"
            checked={counts}
            disabled={full}
            onChange={(e) => setCounts(e.target.checked)}
          />
          Count these toward my cross-platform total
        </label>

        <span className="muted hint">
          {full
            ? `You have the maximum of ${MAX_CUSTOM_PLATFORMS} custom platforms. Remove one to add another.`
            : 'Leave this off for curated sheets. Striver and NeetCode are lists of LeetCode ' +
              'problems, so counting both would count the same work twice — but a genuinely ' +
              'separate site should be counted.'}
        </span>
      </section>

      {existing.length > 0 && (
        <p className="muted hint custom-where">
          {existing.length === 1 ? 'It is' : 'They are'} in the Platforms list above, where you
          can reorder, pause or remove {existing.length === 1 ? 'it' : 'them'}. Set the count
          from the popup or the dashboard.
        </p>
      )}
    </>
  );
}

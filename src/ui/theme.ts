/**
 * Theme resolution, run before React mounts.
 *
 * The source of truth is `settings.theme` in chrome.storage, but that read is
 * async and MV3 extension pages run under `script-src 'self'`, so there is no
 * inline <head> script to fall back on. Without a synchronous source the popup
 * would paint in the wrong theme for a frame every single time it opens.
 *
 * So localStorage carries a mirror of the preference. It is same-origin across
 * every extension page, synchronous, and cheap; chrome.storage stays canonical
 * and the mirror is rewritten whenever settings load or the preference changes.
 *
 * Importing this module also pulls in the stylesheets, so each entry point needs
 * exactly one import to be fully themed.
 */
import './theme.css';
import './viz/tokens.css';

// The type and its guard live with the schema that stores them, so there is one
// definition rather than two that can drift.
import { isThemePref, type ThemePref } from '@/storage/schema';

export type { ThemePref };

const MIRROR_KEY = 'tracker.theme';

export const THEME_CHOICES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Synchronous read of the mirror. Falls back to 'system' if it is absent or junk. */
export function readThemeMirror(): ThemePref {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return isThemePref(raw) ? raw : 'system';
  } catch {
    // localStorage can throw when storage is blocked; 'system' is always safe.
    return 'system';
  }
}

/**
 * Stamps the preference onto <html>. 'system' *removes* the attribute rather than
 * setting data-theme="system" — the CSS falls through to prefers-color-scheme only
 * when no stamp is present.
 */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

/** Persists the mirror and repaints. chrome.storage is written separately by the caller. */
export function writeThemeMirror(pref: ThemePref): void {
  try {
    localStorage.setItem(MIRROR_KEY, pref);
  } catch {
    // Non-fatal: the theme still applies for this page's lifetime.
  }
  applyTheme(pref);
}

// Side effect on import: paint the right theme before anything renders.
applyTheme(readThemeMirror());

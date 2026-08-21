import { useEffect, useState } from 'react';

export const VIEWS = ['overview', 'platforms', 'problems', 'settings'] as const;
export type View = (typeof VIEWS)[number];

function isView(value: string): value is View {
  return (VIEWS as readonly string[]).includes(value);
}

/** The view named by the current hash, or undefined when it names nothing valid. */
function fromHash(): View | undefined {
  const name = window.location.hash.replace(/^#/, '');
  return isView(name) ? name : undefined;
}

/**
 * Which view the page is showing, held in the URL hash.
 *
 * The hash rather than plain state, for three things it gives away free: the back
 * button works, a reload stays put, and the settings view is linkable. A router
 * dependency would buy nothing on top of that for four fixed names.
 *
 * `initial` is the fallback when the hash names nothing — how the options entry point
 * opens straight onto Settings. An explicit hash always wins, so a bookmark still works
 * from either entry point.
 */
export function useHashView(initial: View = 'overview'): [View, (next: View) => void] {
  const [view, setView] = useState<View>(() => fromHash() ?? initial);

  useEffect(() => {
    const onChange = () => setView(fromHash() ?? initial);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [initial]);

  /*
   * Writes the hash and updates state directly rather than waiting for the event.
   * Assigning an identical hash fires no `hashchange` at all, so a click on the view
   * you are already in would otherwise be silently dropped — which matters because the
   * caller also uses this to move focus to the new heading.
   */
  const go = (next: View) => {
    window.location.hash = next;
    setView(next);
  };

  return [view, go];
}

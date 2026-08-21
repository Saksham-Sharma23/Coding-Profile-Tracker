import { useState } from 'react';
import { useThemeMirror, useTracker } from '../useTracker';
import { AppearanceSection } from './sections/AppearanceSection';
import { CustomPlatformsSection } from './sections/CustomPlatformsSection';
import { DataSection } from './sections/DataSection';
import { GoalSection } from './sections/GoalSection';
import { PlatformsSection } from './sections/PlatformsSection';
import { ReminderSection } from './sections/ReminderSection';
import type { SectionProps } from './sections/types';
import './options.css';

/**
 * The settings page, assembled from self-contained sections.
 *
 * Each section takes the same `{ state, updateSettings, flash }`, so this file holds
 * only the page chrome and the two things that genuinely cross section boundaries: the
 * transient confirmation note, and the remount signal an import or reset needs.
 */
export function Options() {
  const { state, loading, updateSettings } = useTracker();
  const [note, setNote] = useState('');

  /*
   * Bumped when stored state is replaced wholesale. PlatformsSection seeds its inputs
   * once on mount so it never fights the user's typing — which means an import has to
   * remount it rather than push new values into it.
   */
  const [revision, setRevision] = useState(0);

  useThemeMirror(state.settings.theme, loading);

  const flash = (message: string) => {
    setNote(message);
    setTimeout(() => setNote(''), 2500);
  };

  if (loading) return <p className="muted pad">Loading…</p>;

  const props: SectionProps = { state, updateSettings, flash };

  return (
    <main className="options">
      <h1>Coding Profile Tracker</h1>
      <p className="muted intro">
        Enter your username for each platform. Everything is fetched directly from your browser and
        stored locally — no account, no server.
      </p>

      <PlatformsSection key={revision} {...props} />
      {note && (
        <p className="ok-text options-note" role="status">
          {note}
        </p>
      )}

      <CustomPlatformsSection {...props} />
      <GoalSection {...props} />
      <ReminderSection {...props} />
      <AppearanceSection {...props} />
      <DataSection {...props} onReplaced={() => setRevision((n) => n + 1)} />
    </main>
  );
}

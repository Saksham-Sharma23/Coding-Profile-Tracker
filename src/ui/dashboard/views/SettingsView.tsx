import { useState } from 'react';
import type { Settings, TrackerState } from '@/storage/schema';
import { AppearanceSection } from '../settings/AppearanceSection';
import { CustomPlatformsSection } from '../settings/CustomPlatformsSection';
import { DataSection } from '../settings/DataSection';
import { GoalSection } from '../settings/GoalSection';
import { PlatformsSection } from '../settings/PlatformsSection';
import { ReminderSection } from '../settings/ReminderSection';
import type { SectionProps } from '../settings/types';
import '../settings/settings.css';

interface Props {
  state: TrackerState;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
}

/**
 * Everything that used to be its own options tab, assembled from the same
 * self-contained sections. This view holds only the two things that genuinely cross
 * section boundaries: the transient confirmation note, and the remount signal an import
 * or a reset needs.
 */
export function SettingsView({ state, updateSettings }: Props) {
  const [note, setNote] = useState('');

  /*
   * Bumped when stored state is replaced wholesale. PlatformsSection seeds its inputs
   * once on mount so it never fights the user's typing — which means an import has to
   * remount it rather than push new values into it.
   */
  const [revision, setRevision] = useState(0);

  const flash = (message: string) => {
    setNote(message);
    setTimeout(() => setNote(''), 2500);
  };

  const props: SectionProps = { state, updateSettings, flash };

  return (
    <div className="options">
      <h2 className="view-title" tabIndex={-1}>
        Settings
      </h2>
      <p className="muted intro">
        Everything is fetched directly from your browser and stored locally — no account, no
        server.
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
    </div>
  );
}

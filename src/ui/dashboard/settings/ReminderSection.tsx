import { sendMessage } from '@/background/messages';
import type { Settings } from '@/storage/schema';
import type { SectionProps } from './types';

export function ReminderSection({ state, updateSettings }: SectionProps) {
  const { reminder } = state.settings;

  /** Anything that changes when an alarm should fire has to re-arm it. */
  const saveAndReschedule = async (partial: Partial<Settings>) => {
    await updateSettings(partial);
    await sendMessage({ type: 'reschedule' });
  };

  return (
    <>
      <h2>Reminders</h2>
      <section className="settings-row">
        <label className="switch-inline">
          <input
            type="checkbox"
            checked={reminder.enabled}
            onChange={(e) =>
              void saveAndReschedule({ reminder: { ...reminder, enabled: e.target.checked } })
            }
          />
          Remind me if I have not solved anything
        </label>
        <select
          value={reminder.hour}
          disabled={!reminder.enabled}
          aria-label="Reminder hour"
          onChange={(e) =>
            void saveAndReschedule({ reminder: { ...reminder, hour: Number(e.target.value) } })
          }
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {formatHour(hour)}
            </option>
          ))}
        </select>
        <span className="muted hint">One notification a day, and only when you are behind.</span>
      </section>
    </>
  );
}

function formatHour(hour: number): string {
  return new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

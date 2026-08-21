import { sendMessage } from '@/background/messages';
import { MIN_REFRESH_MINUTES, type ThemePref } from '@/storage/schema';
import { THEME_CHOICES } from '../../theme';
import type { SectionProps } from './types';

const REFRESH_CHOICES = [15, 30, 60, 120, 360, 720];

export function AppearanceSection({ state, updateSettings }: SectionProps) {
  const { settings } = state;

  return (
    <>
      <h2>Appearance and schedule</h2>
      <section className="settings-row">
        <label htmlFor="theme">Theme</label>
        <select
          id="theme"
          value={settings.theme}
          onChange={(e) => void updateSettings({ theme: e.target.value as ThemePref })}
        >
          {THEME_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>

        <label htmlFor="interval">Refresh every</label>
        <select
          id="interval"
          value={settings.refreshMinutes}
          onChange={(e) => {
            // Changing when the alarm fires has to re-arm it.
            void updateSettings({ refreshMinutes: Number(e.target.value) }).then(() =>
              sendMessage({ type: 'reschedule' }),
            );
          }}
        >
          {REFRESH_CHOICES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`}
            </option>
          ))}
        </select>
        <span className="muted hint">
          Minimum {MIN_REFRESH_MINUTES} minutes, to stay polite to these sites.
        </span>
      </section>
    </>
  );
}

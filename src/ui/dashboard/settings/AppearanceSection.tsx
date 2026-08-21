import { sendMessage } from '@/background/messages';
import { sidePanelSupported } from '@/background/icon-behavior';
import { MIN_REFRESH_MINUTES, type IconOpens, type ThemePref } from '@/storage/schema';
import { THEME_CHOICES } from '../../theme';
import type { SectionProps } from './types';

const REFRESH_CHOICES = [15, 30, 60, 120, 360, 720];

export function AppearanceSection({ state, updateSettings }: SectionProps) {
  const { settings } = state;

  /** Chrome 114+. Offering a switch that silently does nothing is worse than hiding it. */
  const canSidePanel = sidePanelSupported();

  const setIconOpens = async (pref: IconOpens) => {
    await updateSettings({ iconOpens: pref });
    // The worker owns the pair of Chrome calls, so the change takes effect on the next
    // click rather than the next browser start.
    await sendMessage({ type: 'apply-icon-behavior', pref });
  };

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

        {canSidePanel && (
          <>
            <label htmlFor="icon-opens">Toolbar icon opens</label>
            <select
              id="icon-opens"
              value={settings.iconOpens}
              onChange={(e) => void setIconOpens(e.target.value as IconOpens)}
            >
              <option value="popup">The popup</option>
              <option value="sidepanel">The side panel</option>
            </select>
            <span className="muted hint">
              Chrome allows the icon only one of the two. The popup closes as soon as you
              click the page behind it; the side panel stays open beside it while you
              solve. Either way you can still reach the other from a button.
            </span>
          </>
        )}
      </section>
    </>
  );
}

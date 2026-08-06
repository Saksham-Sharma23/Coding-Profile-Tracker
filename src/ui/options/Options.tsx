import { useEffect, useRef, useState } from 'react';
import { sendMessage } from '@/background/messages';
import { orderedAdapters } from '@/platforms/registry';
import type { PlatformId } from '@/platforms/types';
import { clearAll, readState, saveSettings, updateState } from '@/storage/repo';
import { migrate, MIN_REFRESH_MINUTES, type ThemePref } from '@/storage/schema';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  DownloadIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '../icons';
import { THEME_CHOICES } from '../theme';
import { useThemeMirror, useTracker } from '../useTracker';
import './options.css';

type Validation = { status: 'idle' | 'checking' | 'ok' | 'bad'; message?: string };

const REFRESH_CHOICES = [15, 30, 60, 120, 360, 720];
const GOAL_CHOICES = [0, 1, 2, 3, 5, 10];

export function Options() {
  const { state, loading, updateSettings } = useTracker();
  const [drafts, setDrafts] = useState<Partial<Record<PlatformId, string>>>({});
  const [checks, setChecks] = useState<Partial<Record<PlatformId, Validation>>>({});
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useThemeMirror(state.settings.theme, loading);

  // Seed the inputs once state arrives; later storage changes must not clobber
  // whatever the user is currently typing.
  useEffect(() => {
    if (!loading) setDrafts(state.settings.handles);
  }, [loading]);

  const adapters = orderedAdapters(state.settings.order);

  function flash(message: string) {
    setNote(message);
    setTimeout(() => setNote(''), 2500);
  }

  const setDraft = (id: PlatformId, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: value }));
    setChecks((prev) => ({ ...prev, [id]: { status: 'idle' } }));
  };

  /** Live test fetch, so a typo is caught here rather than silently failing later. */
  const verify = async (id: PlatformId) => {
    const handle = drafts[id]?.trim();
    if (!handle) return;

    setChecks((prev) => ({ ...prev, [id]: { status: 'checking' } }));
    const res = await sendMessage({ type: 'validate-handle', platform: id, handle });

    if (res.type === 'validate-result') {
      setChecks((prev) => ({
        ...prev,
        [id]: res.ok ? { status: 'ok' } : { status: 'bad', message: res.error ?? 'Could not verify' },
      }));
    }
  };

  const save = async () => {
    const handles = Object.fromEntries(
      Object.entries(drafts)
        .map(([id, value]) => [id, value?.trim() ?? ''])
        .filter(([, value]) => value),
    ) as Partial<Record<PlatformId, string>>;

    // Seed the popup's expanded rows on the first save, so a new user lands on an
    // open row instead of a wall of collapsed ones. Only when they have never chosen —
    // afterwards the popup's own toggles are the authority.
    const seedExpanded =
      state.settings.expanded.length === 0
        ? { expanded: Object.keys(handles) as PlatformId[] }
        : {};

    await saveSettings({ handles, ...seedExpanded });
    await sendMessage({ type: 'reschedule' });
    await sendMessage({ type: 'refresh' });
    flash('Saved');
  };

  /** Anything that changes when an alarm should fire has to re-arm it. */
  const saveAndReschedule = async (partial: Parameters<typeof updateSettings>[0]) => {
    await updateSettings(partial);
    await sendMessage({ type: 'reschedule' });
  };

  const toggleEnabled = (id: PlatformId, on: boolean) =>
    void updateSettings({ enabled: { ...state.settings.enabled, [id]: on } });

  /** Moves one platform by a step, persisting the full explicit order. */
  const move = (id: PlatformId, delta: number) => {
    const ids = adapters.map((adapter) => adapter.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;

    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    void updateSettings({ order: next });
  };

  const exportJson = async () => {
    const blob = new Blob([JSON.stringify(await readState(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coding-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      // migrate() is exactly the validation an import needs: it accepts any shape,
      // keeps what it recognises, and drops the rest.
      const imported = migrate(JSON.parse(await file.text()));
      await updateState(() => imported);
      setDrafts(imported.settings.handles);
      await sendMessage({ type: 'reschedule' });
      flash('Imported');
    } catch {
      flash('That file could not be read as a tracker backup.');
    }
  };

  const reset = async () => {
    if (!confirm('Delete every username, snapshot and history point? This cannot be undone.')) {
      return;
    }
    await clearAll();
    setDrafts({});
    setChecks({});
    await sendMessage({ type: 'reschedule' });
    flash('Everything cleared');
  };

  if (loading) return <p className="muted pad">Loading…</p>;

  const { settings } = state;

  return (
    <main className="options">
      <h1>Coding Profile Tracker</h1>
      <p className="muted intro">
        Enter your username for each platform. Everything is fetched directly from your browser and
        stored locally — no account, no server.
      </p>

      <h2>Platforms</h2>
      <section className="platforms">
        {adapters.map((adapter, index) => {
          const check = checks[adapter.id] ?? { status: 'idle' };
          const detected = state.detected[adapter.id];
          const draft = drafts[adapter.id] ?? '';
          const on = settings.enabled[adapter.id] !== false;

          return (
            <div key={adapter.id} className={on ? 'platform-row' : 'platform-row off'}>
              <div className="reorder">
                <button
                  className="btn-icon btn-ghost"
                  onClick={() => move(adapter.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${adapter.displayName} up`}
                >
                  <ArrowUpIcon size={13} />
                </button>
                <button
                  className="btn-icon btn-ghost"
                  onClick={() => move(adapter.id, 1)}
                  disabled={index === adapters.length - 1}
                  aria-label={`Move ${adapter.displayName} down`}
                >
                  <ArrowDownIcon size={13} />
                </button>
              </div>

              <label className="row platform-name" htmlFor={`h-${adapter.id}`}>
                <span className="dot" style={{ background: adapter.accent }} />
                {adapter.displayName}
              </label>

              <div className="input-wrap">
                <input
                  id={`h-${adapter.id}`}
                  value={draft}
                  placeholder="username"
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setDraft(adapter.id, e.target.value)}
                  onBlur={() => void verify(adapter.id)}
                />
                <Status check={check} />
              </div>

              <label className="switch" title={on ? 'Tracking' : 'Paused'}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggleEnabled(adapter.id, e.target.checked)}
                />
                <span className="switch-track" aria-hidden="true" />
                <span className="visually-hidden">Track {adapter.displayName}</span>
              </label>

              {detected && detected !== draft && (
                <button className="suggest" onClick={() => setDraft(adapter.id, detected)}>
                  Detected: <strong>{detected}</strong> — use this
                </button>
              )}
            </div>
          );
        })}
      </section>

      <div className="actions row">
        <button className="btn-primary" onClick={() => void save()}>
          Save and refresh
        </button>
        {note && <span className="ok-text">{note}</span>}
      </div>

      <h2>Daily goal</h2>
      <section className="settings-row">
        <label htmlFor="goal">Aim for</label>
        <select
          id="goal"
          value={settings.dailyGoal}
          onChange={(e) => void updateSettings({ dailyGoal: Number(e.target.value) })}
        >
          {GOAL_CHOICES.map((goal) => (
            <option key={goal} value={goal}>
              {goal === 0 ? 'No goal' : `${goal} problem${goal === 1 ? '' : 's'} a day`}
            </option>
          ))}
        </select>
        <span className="muted hint">
          Counted from the day-over-day change in your solve totals, so it needs a day of history
          before it can show anything.
        </span>
      </section>

      <h2>Reminders</h2>
      <section className="settings-row">
        <label className="switch-inline">
          <input
            type="checkbox"
            checked={settings.reminder.enabled}
            onChange={(e) =>
              void saveAndReschedule({
                reminder: { ...settings.reminder, enabled: e.target.checked },
              })
            }
          />
          Remind me if I have not solved anything
        </label>
        <select
          value={settings.reminder.hour}
          disabled={!settings.reminder.enabled}
          aria-label="Reminder hour"
          onChange={(e) =>
            void saveAndReschedule({
              reminder: { ...settings.reminder, hour: Number(e.target.value) },
            })
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
          onChange={(e) => void saveAndReschedule({ refreshMinutes: Number(e.target.value) })}
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

      <h2>Your data</h2>
      <section className="settings-row">
        <button onClick={() => void exportJson()}>
          <DownloadIcon size={13} /> Export JSON
        </button>
        <button onClick={() => fileInput.current?.click()}>
          <UploadIcon size={13} /> Import JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importJson(file);
            e.target.value = '';
          }}
        />
        <button className="danger" onClick={() => void reset()}>
          <TrashIcon size={13} /> Delete everything
        </button>
        <span className="muted hint">
          History lives only in this browser profile. Export it before reinstalling.
        </span>
      </section>
    </main>
  );
}

function formatHour(hour: number): string {
  return new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Status({ check }: { check: Validation }) {
  if (check.status === 'checking') return <span className="muted check">checking…</span>;
  if (check.status === 'ok') {
    return (
      <span className="check ok-text" title="Profile found">
        <CheckIcon size={14} />
      </span>
    );
  }
  if (check.status === 'bad') {
    return (
      <span className="check bad-text" title={check.message}>
        <XIcon size={14} /> {check.message}
      </span>
    );
  }
  return null;
}

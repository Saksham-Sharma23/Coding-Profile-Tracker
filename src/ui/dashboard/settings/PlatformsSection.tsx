import { useState } from 'react';
import { sendMessage } from '@/background/messages';
import { customAdapters } from '@/platforms/custom/adapter';
import { orderedAdapters } from '@/platforms/registry';
import type { PlatformId } from '@/platforms/types';
import {
  changedHandles,
  hasStoredData,
  removeCustomPlatform,
  saveSettings,
} from '@/storage/repo';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  TrashIcon,
  XIcon,
} from '../../icons';
import type { SectionProps } from './types';

type Validation = { status: 'idle' | 'checking' | 'ok' | 'bad'; message?: string };

/** Usernames, order, on/off, and removal of user-defined platforms. */
export function PlatformsSection({ state, updateSettings, flash }: SectionProps) {
  /*
   * Seeded once, on mount. The host only renders this section after state has loaded,
   * and following storage afterwards would clobber whatever the user is mid-way through
   * typing — another open surface writes on every refresh. An import replaces the
   * handles wholesale, so the host remounts this section instead.
   */
  const [drafts, setDrafts] = useState<Partial<Record<PlatformId, string>>>(
    () => state.settings.handles,
  );
  const [checks, setChecks] = useState<Partial<Record<PlatformId, Validation>>>({});

  const adapters = orderedAdapters(
    state.settings.order,
    customAdapters(state.settings.custom),
  );

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

    /*
     * Repointing a platform at a different username discards its history and solved
     * list, because that data describes the previous account. Worth a confirm: the most
     * likely way to trigger it is a typo in a handle field, and the cost of an
     * unannounced one is a year of someone's progress. Only asks when there is
     * something real to lose.
     */
    const losing = changedHandles(state.settings.handles, handles).filter((id) =>
      hasStoredData(state, id),
    );
    if (losing.length) {
      const names = losing
        .map((id) => adapters.find((adapter) => adapter.id === id)?.displayName ?? id)
        .join(', ');
      const ok = window.confirm(
        `Changing the username for ${names} will clear the stored history and solved ` +
          `problems for ${losing.length > 1 ? 'those platforms' : 'that platform'}, ` +
          `because that data belongs to the previous account.\n\nContinue?`,
      );
      if (!ok) return;
    }

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

  /**
   * The only deletion in the app with no recovery path — a hand-kept count cannot be
   * re-fetched from anywhere — so the confirm names the number it destroys.
   */
  const remove = async (id: PlatformId, name: string) => {
    const count = state.snapshots[id]?.stats?.solved?.total;
    const kept =
      count === undefined
        ? ''
        : `\n\nIts count of ${count.toLocaleString()} was typed in by hand and cannot be fetched again.`;

    if (!window.confirm(`Remove ${name} and everything stored for it?${kept}`)) return;
    await removeCustomPlatform(id);
    flash(`Removed ${name}`);
  };

  return (
    <>
      <h2>Platforms</h2>
      <section className="platforms">
        {adapters.map((adapter, index) => {
          const check = checks[adapter.id] ?? { status: 'idle' };
          const detected = state.detected[adapter.id];
          const draft = drafts[adapter.id] ?? '';
          const on = state.settings.enabled[adapter.id] !== false;
          // A hand-kept counter has no account to name, so the username field is
          // replaced rather than left as an input that can do nothing.
          const def = state.settings.custom.find((each) => each.id === adapter.id);
          const manual = !adapter.capabilities.requiresHandle;

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
                {manual ? (
                  <span className="muted hint">
                    Counted by hand
                    {def?.target !== undefined && ` · ${def.target.toLocaleString()} on the sheet`}
                    {def?.countsTowardTotal === false && ' · not in your total'}
                  </span>
                ) : (
                  <>
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
                  </>
                )}
              </div>

              <div className="row platform-actions">
                <label className="switch" title={on ? 'Tracking' : 'Paused'}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => toggleEnabled(adapter.id, e.target.checked)}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  <span className="visually-hidden">Track {adapter.displayName}</span>
                </label>

                {def && (
                  <button
                    className="btn-icon btn-ghost danger-ghost"
                    onClick={() => void remove(adapter.id, adapter.displayName)}
                    aria-label={`Remove ${adapter.displayName}`}
                    title={`Remove ${adapter.displayName}`}
                  >
                    <TrashIcon size={13} />
                  </button>
                )}
              </div>

              {detected && detected !== draft && !manual && (
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
      </div>
    </>
  );
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

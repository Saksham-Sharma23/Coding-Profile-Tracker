import type { PlatformAdapter } from '@/platforms/types';
import type { TrackerState } from '@/storage/schema';
import {
  AlertIcon,
  ChartIcon,
  GridIcon,
  ListIcon,
  RefreshIcon,
  SettingsIcon,
} from '../icons';
import { timeAgo } from '../useTracker';
import { VIEWS, type View } from './useHashView';
import './Sidebar.css';

const NAV: { view: View; label: string; Icon: typeof ChartIcon }[] = [
  { view: 'overview', label: 'Overview', Icon: ChartIcon },
  { view: 'platforms', label: 'Platforms', Icon: GridIcon },
  { view: 'problems', label: 'Problems', Icon: ListIcon },
  { view: 'settings', label: 'Settings', Icon: SettingsIcon },
];

interface Props {
  state: TrackerState;
  tracked: PlatformAdapter[];
  view: View;
  onNavigate: (next: View) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * The persistent left rail: navigation, plus a live read on whether anything is broken.
 *
 * The platform list is the part that earns its place. Previously a failing platform was
 * only visible by scrolling to its card, so a settings page could sit open indefinitely
 * next to a platform that had been erroring for a week. Here it is on screen from every
 * view, including Settings — which is where you would go to fix it.
 */
export function Sidebar({ state, tracked, view, onNavigate, refreshing, onRefresh }: Props) {
  // Manual snapshots carry the moment the user last clicked, not a fetch, so they would
  // make "Updated 2m ago" claim something the extension never did.
  const newest = Math.max(
    0,
    ...Object.values(state.snapshots).map((snap) => (snap?.manual ? 0 : (snap?.fetchedAt ?? 0))),
  );

  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-brand">
        <span className="rail-brand-mark" aria-hidden="true" />
        <span className="rail-brand-text">Coding Tracker</span>
      </div>

      <ul className="rail-nav">
        {NAV.map(({ view: name, label, Icon }) => (
          <li key={name}>
            <button
              type="button"
              className={view === name ? 'rail-item active' : 'rail-item'}
              // aria-current, not aria-selected: these are page-level destinations, and
              // the pressed style alone tells a screen reader nothing.
              aria-current={view === name ? 'page' : undefined}
              title={label}
              onClick={() => onNavigate(name)}
            >
              <Icon size={15} />
              <span className="rail-item-text">{label}</span>
            </button>
          </li>
        ))}
      </ul>

      {tracked.length > 0 && (
        <div className="rail-platforms">
          <h2 className="rail-heading">Tracking</h2>
          <ul>
            {tracked.map((adapter) => {
              const snapshot = state.snapshots[adapter.id];
              const failed = snapshot?.status === 'error';
              const primary = snapshot?.stats?.headline[0];

              return (
                <li key={adapter.id} className="rail-platform">
                  <span className="dot" style={{ background: adapter.accent }} />
                  <span className="rail-platform-name">{adapter.displayName}</span>
                  {failed ? (
                    <AlertIcon size={12} className="rail-platform-alert" />
                  ) : (
                    <span className="rail-platform-value num muted">
                      {primary === undefined
                        ? '—'
                        : typeof primary.value === 'number'
                          ? primary.value.toLocaleString()
                          : primary.value}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rail-foot">
        <button className="rail-refresh" onClick={onRefresh} disabled={refreshing}>
          <RefreshIcon size={13} className={refreshing ? 'spin' : undefined} />
          <span className="rail-item-text">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
        <span className="muted rail-updated">Fetched {timeAgo(newest)}</span>
      </div>
    </nav>
  );
}

/** Narrow-screen fallback: the same destinations as a scrollable row of tabs. */
export function TabBar({ view, onNavigate }: Pick<Props, 'view' | 'onNavigate'>) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {VIEWS.map((name) => (
        <button
          key={name}
          type="button"
          className={view === name ? 'tabbar-item active' : 'tabbar-item'}
          aria-current={view === name ? 'page' : undefined}
          onClick={() => onNavigate(name)}
        >
          {NAV.find((item) => item.view === name)?.label ?? name}
        </button>
      ))}
    </nav>
  );
}

import type { Settings, TrackerState } from '@/storage/schema';

/**
 * What every settings section needs. Deliberately uniform, so a section can be moved
 * to another host page without changing its signature — the dashboard's Settings view
 * re-parents these as-is.
 */
export interface SectionProps {
  state: TrackerState;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  /** Shows a transient confirmation, owned by the host page. */
  flash: (message: string) => void;
}

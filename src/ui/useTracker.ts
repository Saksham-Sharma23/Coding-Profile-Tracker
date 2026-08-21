import { useCallback, useEffect, useState } from 'react';
import { readState, recordManual, saveSettings } from '@/storage/repo';
import { defaultState, type Settings, type TrackerState } from '@/storage/schema';
import { sendMessage } from '@/background/messages';
import type { PlatformAdapter, PlatformId } from '@/platforms/types';
import type { Counter } from './components/ManualCounter';
import { writeThemeMirror } from './theme';

/**
 * Reads tracker state and stays subscribed to chrome.storage changes, so cards
 * update live as each platform's refresh lands rather than all at once at the end.
 */
export function useTracker() {
  const [state, setState] = useState<TrackerState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;

    void readState().then((next) => {
      if (!active) return;
      setState(next);
      setLoading(false);
    });

    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !changes.tracker) return;
      void readState().then((next) => {
        if (active) setState(next);
      });
    };

    chrome.storage.onChanged.addListener(onChange);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);

  const refresh = useCallback(async (platforms?: PlatformId[]) => {
    setRefreshing(true);
    try {
      await sendMessage({ type: 'refresh', ...(platforms && { platforms }) });
    } finally {
      setRefreshing(false);
    }
  }, []);

  /**
   * Writes settings and lets the storage listener above push the result back, so every
   * open surface stays in step rather than each keeping its own copy.
   */
  const updateSettings = useCallback(async (partial: Partial<Settings>) => {
    if (partial.theme) writeThemeMirror(partial.theme);
    await saveSettings(partial);
  }, []);

  /**
   * The editing hooks for a hand-kept counter, or undefined for anything fetched.
   *
   * Lives here so the popup and the dashboard each stay a one-liner and the descriptor
   * lookup has exactly one definition — a second copy would be the thing that gets
   * forgotten when a third surface appears.
   */
  const counterFor = useCallback(
    (adapter: PlatformAdapter): Counter | undefined => {
      if (adapter.capabilities.fetchable) return undefined;
      const def = state.settings.custom.find((each) => each.id === adapter.id);
      if (!def) return undefined;
      return {
        ...(def.target !== undefined && { target: def.target }),
        onChange: (next) => recordManual(def, next),
      };
    },
    [state.settings.custom],
  );

  return { state, loading, refreshing, refresh, updateSettings, counterFor };
}

/**
 * Keeps the pre-paint theme mirror in step with stored settings — another surface may
 * have changed the preference since this page last painted.
 */
export function useThemeMirror(theme: TrackerState['settings']['theme'], loading: boolean): void {
  useEffect(() => {
    if (!loading) writeThemeMirror(theme);
  }, [theme, loading]);
}

export function timeAgo(ts: number): string {
  if (!ts) return 'never';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

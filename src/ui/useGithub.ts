import { useEffect, useState } from 'react';
import { defaultGithubState, readGithubState } from '@/github/storage';
import type { GithubState } from '@/github/types';

/**
 * Reads GitHub state and stays subscribed to changes, so the push log and queue update
 * live while the service worker is committing rather than only on reload.
 *
 * Watches the `github` key specifically — the same reason that key exists at all is that
 * it must never be conflated with the exportable tracker blob.
 */
export function useGithub(): { github: GithubState; loading: boolean } {
  const [github, setGithub] = useState<GithubState>(defaultGithubState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void readGithubState().then((next) => {
      if (!active) return;
      setGithub(next);
      setLoading(false);
    });

    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.github) return;
      void readGithubState().then((next) => {
        if (active) setGithub(next);
      });
    };

    chrome.storage.onChanged.addListener(onChange);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);

  return { github, loading };
}

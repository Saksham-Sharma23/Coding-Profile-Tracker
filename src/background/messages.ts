import type { RepoSummary } from '@/github/api';
import type { CapturedSubmission } from '@/github/types';
import type { PlatformId } from '@/platforms/types';
import type { IconOpens } from '@/storage/schema';
import type { RefreshOutcome } from './refresh';

/** Wire protocol between extension pages, content scripts and the service worker. */
export type Message =
  | { type: 'refresh'; platforms?: PlatformId[] }
  | { type: 'validate-handle'; platform: PlatformId; handle: string }
  | { type: 'reschedule' }
  | { type: 'apply-icon-behavior'; pref: IconOpens }
  | { type: 'handle-detected'; platform: PlatformId; handle: string }
  /*
   * Capture handshake. The content script asks before doing anything at all, so an
   * extension with GitHub unconfigured makes no LeetCode requests beyond what the
   * profile adapter already made.
   */
  | { type: 'github-capture-ready' }
  /** Recent accepted submission ids seen on the page; the worker replies with the new ones. */
  | { type: 'leetcode-recent-ac'; entries: string[] }
  | { type: 'submission-captured'; payload: CapturedSubmission }
  | { type: 'github-connect-pat'; token: string }
  | { type: 'github-disconnect' }
  | { type: 'github-list-repos' }
  | { type: 'github-create-repo'; name: string; private: boolean }
  | { type: 'github-set-repo'; owner: string; name: string; branch: string }
  | { type: 'github-set-enabled'; enabled: boolean }
  | { type: 'github-retry-queue' };

export interface CaptureConfig {
  type: 'capture-config';
  enabled: boolean;
  /** The confirmed LeetCode handle. Absent means there is nothing to capture for. */
  handle?: string;
}

export interface CaptureRequest {
  type: 'capture-request';
  /** Submission ids not yet seen, so the page only fetches details for genuinely new work. */
  ids: string[];
}

export type Response =
  | { type: 'refresh-result'; outcomes: RefreshOutcome[] }
  | { type: 'validate-result'; ok: boolean; error?: string }
  | { type: 'ack' }
  | { type: 'error'; error: string }
  | CaptureConfig
  | CaptureRequest
  | { type: 'github-result'; ok: boolean; error?: string }
  | { type: 'github-repos'; repos: RepoSummary[] };

export function sendMessage(message: Message): Promise<Response> {
  return chrome.runtime.sendMessage(message);
}

/**
 * Port name for the Device Flow.
 *
 * A port rather than a message because the flow polls GitHub for up to fifteen minutes,
 * far longer than the ~30s idle teardown a service worker gets. An open port keeps the
 * worker alive for exactly as long as the settings page is showing the code, and closing
 * that page aborts the flow instead of orphaning a poll loop.
 */
export const DEVICE_FLOW_PORT = 'github-device-flow';

/** Sent by the page to begin; the worker replies with code, then result, over the port. */
export interface DeviceFlowStart {
  type: 'start';
  scope: string;
}

export type DeviceFlowEvent =
  | { type: 'code'; userCode: string; verificationUri: string; expiresAt: number }
  | { type: 'connected'; login: string }
  | { type: 'failed'; error: string };

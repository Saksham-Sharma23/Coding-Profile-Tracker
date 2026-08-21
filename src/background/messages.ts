import type { PlatformId } from '@/platforms/types';
import type { IconOpens } from '@/storage/schema';
import type { RefreshOutcome } from './refresh';

/** Wire protocol between extension pages and the service worker. */
export type Message =
  | { type: 'refresh'; platforms?: PlatformId[] }
  | { type: 'validate-handle'; platform: PlatformId; handle: string }
  | { type: 'reschedule' }
  | { type: 'apply-icon-behavior'; pref: IconOpens }
  | { type: 'handle-detected'; platform: PlatformId; handle: string };

export type Response =
  | { type: 'refresh-result'; outcomes: RefreshOutcome[] }
  | { type: 'validate-result'; ok: boolean; error?: string }
  | { type: 'ack' }
  | { type: 'error'; error: string };

export function sendMessage(message: Message): Promise<Response> {
  return chrome.runtime.sendMessage(message);
}

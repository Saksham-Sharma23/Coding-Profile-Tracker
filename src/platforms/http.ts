import { FetchError, HandleNotFoundError, type PlatformId } from './types';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Treat 404 as "this handle does not exist" instead of a transport failure.
   * Platforms that 404 for unknown users set this.
   */
  notFoundMeansMissingHandle?: boolean;
  /**
   * Status codes whose body should still be parsed rather than thrown on. Codeforces
   * needs this: an unknown handle comes back as HTTP 400 carrying the very envelope
   * ({status:"FAILED",comment:"...not found"}) we need in order to report it properly.
   */
  allowStatuses?: number[];
}

/**
 * Performs a request from the service worker, where host_permissions exempts us from
 * CORS. The identical call from an extension page or content script would be blocked.
 *
 * Returns the raw Response so callers can inspect status before choosing how to parse.
 */
export async function request(
  platform: PlatformId,
  url: string,
  handle: string,
  signal: AbortSignal,
  options: RequestOptions = {},
): Promise<Response> {
  const init: RequestInit = { signal, method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json', ...options.headers };
  } else if (options.headers) {
    init.headers = options.headers;
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // AbortError is our own timeout firing, not a network fault — the two warrant
    // different user-facing advice, so they get different messages.
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new FetchError(platform, 'request timed out');
    }
    throw new FetchError(platform, err instanceof Error ? err.message : String(err));
  }

  if (res.status === 404 && options.notFoundMeansMissingHandle) {
    throw new HandleNotFoundError(platform, handle);
  }
  if (!res.ok && !options.allowStatuses?.includes(res.status)) {
    throw new FetchError(platform, `HTTP ${res.status}`);
  }
  return res;
}

export async function getJson<T>(
  platform: PlatformId,
  url: string,
  handle: string,
  signal: AbortSignal,
  options: RequestOptions = {},
): Promise<T> {
  const res = await request(platform, url, handle, signal, options);
  return (await res.json()) as T;
}

export async function getText(
  platform: PlatformId,
  url: string,
  handle: string,
  signal: AbortSignal,
  options: RequestOptions = {},
): Promise<string> {
  const res = await request(platform, url, handle, signal, options);
  return await res.text();
}

export async function postJson<T>(
  platform: PlatformId,
  url: string,
  handle: string,
  body: unknown,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<T> {
  return getJson<T>(platform, url, handle, signal, { method: 'POST', body, headers });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

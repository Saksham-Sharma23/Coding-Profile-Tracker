import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, request } from './http';
import { FetchError, HandleNotFoundError } from './types';

const SIGNAL = new AbortController().signal;

function stubFetch(init: { status: number; body?: unknown }) {
  const impl = vi.fn().mockResolvedValue({
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    json: async () => init.body,
    text: async () => JSON.stringify(init.body),
  } as Response);
  vi.stubGlobal('fetch', impl);
  return impl;
}

afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('returns the response on success', async () => {
    stubFetch({ status: 200, body: { ok: true } });
    const res = await request('leetcode', 'https://x.test', 'u', SIGNAL);
    expect(res.status).toBe(200);
  });

  it('maps 404 to HandleNotFoundError only when the platform opts in', async () => {
    stubFetch({ status: 404 });
    await expect(
      request('hackerrank', 'https://x.test', 'ghost', SIGNAL, {
        notFoundMeansMissingHandle: true,
      }),
    ).rejects.toBeInstanceOf(HandleNotFoundError);

    stubFetch({ status: 404 });
    await expect(request('hackerrank', 'https://x.test', 'ghost', SIGNAL)).rejects.toBeInstanceOf(
      FetchError,
    );
  });

  it('parses the body of an allowed error status', async () => {
    // Codeforces sends its FAILED envelope with HTTP 400; throwing early would
    // discard the very message that identifies an unknown handle.
    stubFetch({ status: 400, body: { status: 'FAILED', comment: 'not found' } });
    const body = await getJson<{ comment: string }>('codeforces', 'https://x.test', 'u', SIGNAL, {
      allowStatuses: [400],
    });
    expect(body.comment).toBe('not found');
  });

  it('still throws on an error status that was not allowed', async () => {
    stubFetch({ status: 500 });
    await expect(
      request('codeforces', 'https://x.test', 'u', SIGNAL, { allowStatuses: [400] }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('reports an aborted request as a timeout rather than a network fault', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
    );
    await expect(request('leetcode', 'https://x.test', 'u', SIGNAL)).rejects.toThrow(/timed out/);
  });

  it('wraps network failures in FetchError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    await expect(request('leetcode', 'https://x.test', 'u', SIGNAL)).rejects.toBeInstanceOf(
      FetchError,
    );
  });
});

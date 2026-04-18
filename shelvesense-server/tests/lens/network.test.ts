/*
 * Node-only tests for shelvesense-lens/src/utils/network.ts.
 * These validate retry/error behavior with mocked InternetModule fetch implementations.
 */

import { fetchJson } from '../../../shelvesense-lens/src/utils/network';

describe('lens network.ts retry/backoff', () => {
  it('retries twice and succeeds on the third attempt', async () => {
    // Guards against regressions where transient network errors are no longer retried and scans fail too eagerly.
    const internet = {
      fetch: jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary offline'))
        .mockRejectedValueOnce(new Error('gateway reset'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'x-shelvesense-session': 'sess-123' },
          }),
        ),
    } as any;
    const delay = jest.fn(async (_ms: number) => {});

    const out = await fetchJson<{ ok: boolean }>(
      internet,
      'https://api.example.com/api',
      { method: 'GET', path: '/profile', maxRetries: 3 },
      delay,
    );

    expect(out.json.ok).toBe(true);
    expect(out.sessionHeader).toBe('sess-123');
    expect(internet.fetch).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 400);
    expect(delay).toHaveBeenNthCalledWith(2, 800);
  });

  it('returns a structured HTTP error after all retries are exhausted', async () => {
    // Guards against unhandled rejection regressions by asserting callers receive a typed status/bodySnippet error object.
    const terminalErr = Object.assign(new Error('HTTP 503'), {
      status: 503,
      bodySnippet: '{"error":{"code":"UPSTREAM","message":"busy"}}',
    });
    const internet = {
      fetch: jest.fn().mockRejectedValue(terminalErr),
    } as any;
    const delay = jest.fn(async (_ms: number) => {});

    await expect(
      fetchJson(
        internet,
        'https://api.example.com/api',
        { method: 'POST', path: '/analyze-label', body: { x: 1 }, maxRetries: 2 },
        delay,
      ),
    ).rejects.toMatchObject({
      status: 503,
      bodySnippet: expect.any(String),
    });

    expect(internet.fetch).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it('BUG: enforces timeout for never-resolving fetch instead of hanging indefinitely', async () => {
    // Guards against UI lockups where unresolved fetch promises never reject and the lens remains stuck in analyzing state.
    // TODO(prod): Add AbortController-based timeout in fetchJson using configurable SHELFSENSE_AI_TIMEOUT_MS.
    const internet = {
      fetch: jest.fn(
        async () =>
          await new Promise<Response>(() => {
            // Intentionally never resolves.
          }),
      ),
    } as any;
    const delay = jest.fn(async (_ms: number) => {});

    const result = await Promise.race([
      fetchJson(internet, 'https://api.example.com/api', { path: '/analyze-label', maxRetries: 0, timeoutMs: 60 }, delay)
        .then(() => 'resolved')
        .catch(() => 'rejected'),
      new Promise<'timed_out'>((resolve) => {
        setTimeout(() => resolve('timed_out'), 400);
      }),
    ]);

    expect(result).toBe('rejected');
  });
});

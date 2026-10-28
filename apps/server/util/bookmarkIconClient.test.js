import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { buildFaviconApiUrl, fetchFaviconFromApi, normalizeOrigin } from './bookmarkIconClient.js';

async function withService(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/favimg/`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('bookmarkIconClient URL construction', () => {
  it('uses the configured base path for favicon and health requests', () => {
    expect(
      buildFaviconApiUrl('', 'http://127.0.0.1:3456/custom/', {
        url: 'https://example.com/path',
        preview: '1',
      }).toString(),
    ).toBe('http://127.0.0.1:3456/custom/?url=https%3A%2F%2Fexample.com%2Fpath&preview=1');
    expect(buildFaviconApiUrl('health', 'http://127.0.0.1:3480/favimg/').toString()).toBe(
      'http://127.0.0.1:3480/favimg/health',
    );
  });

  it('normalizes uppercase schemes and bare domains', () => {
    expect(normalizeOrigin('  HTTPS://Example.com/path  ')).toBe('https://example.com');
    expect(normalizeOrigin('example.com/path')).toBe('https://example.com');
    expect(normalizeOrigin('')).toBeNull();
  });
});

describe('bookmarkIconClient service boundary', () => {
  it.each([
    [502, { code: 'DNS_ERROR', retryable: true }, 'DNS_ERROR'],
    [504, { code: 'UPSTREAM_TIMEOUT', retryable: true }, 'UPSTREAM_TIMEOUT'],
    [500, { code: 'INTERNAL_ERROR', retryable: true }, 'INTERNAL_ERROR'],
    [404, { code: 'ICON_NOT_FOUND', retryable: false }, 'ICON_NOT_FOUND'],
    [502, { code: 'UNKNOWN_ERROR' }, 'SERVICE_PROTOCOL_ERROR'],
    [200, { code: 'DNS_ERROR' }, 'SERVICE_PROTOCOL_ERROR'],
  ])('preserves service semantics for HTTP %s / %j', async (status, body, expectedCode) => {
    await withService(
      (req, res) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      },
      async (baseUrl) => {
        expect(await fetchFaviconFromApi('https://example.com', { baseUrl })).toMatchObject({
          ok: false,
          errorCode: expectedCode,
        });
      },
    );
  });

  it('does not mislabel a disconnected favicon service as a target website failure', async () => {
    let baseUrl;
    await withService(
      (req, res) => res.end(),
      async (url) => {
        baseUrl = url;
      },
    );
    expect(await fetchFaviconFromApi('https://example.com', { baseUrl })).toMatchObject({
      ok: false,
      errorCode: 'SERVICE_UNAVAILABLE',
    });
  });

  it('bounds a slowly streamed body by total time, even while data keeps arriving', async () => {
    await withService(
      (req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        const timer = setInterval(() => res.write('chunk'), 5);
        res.on('close', () => clearInterval(timer));
      },
      async (baseUrl) => {
        expect(await fetchFaviconFromApi('https://example.com', { baseUrl, timeoutMs: 35 })).toMatchObject({
          ok: false,
          errorCode: 'SERVICE_TIMEOUT',
        });
      },
    );
  });

  it.each(['text/html', 'image/png'])('rejects invalid or empty %s responses', async (contentType) => {
    await withService(
      (req, res) => {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(contentType === 'text/html' ? '<html>proxy failure</html>' : '');
      },
      async (baseUrl) => {
        expect(await fetchFaviconFromApi('https://example.com', { baseUrl })).toMatchObject({
          ok: false,
          errorCode: 'SERVICE_PROTOCOL_ERROR',
        });
      },
    );
  });

  it('returns image bytes and keeps preview requests out of the public usage counter', async () => {
    const bytes = Buffer.alloc(64, 1);
    await withService(
      (req, res) => {
        expect(new URL(req.url, 'http://localhost').searchParams.get('preview')).toBe('1');
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(bytes);
      },
      async (baseUrl) => {
        const result = await fetchFaviconFromApi('https://example.com', { baseUrl });
        expect(result.ok).toBe(true);
        expect(result.buffer).toEqual(bytes);
      },
    );
  });
});

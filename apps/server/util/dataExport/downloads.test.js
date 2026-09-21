import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
const get = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get } }));
vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));
import { publicImageStream, imageExtension } from './downloads.js';
describe('export network boundaries', () => {
  it('blocks private addresses before any connection', async () => {
    for (const url of [
      'http://127.0.0.1/x',
      'http://169.254.169.254/x',
      'http://[::1]/x',
      'file:///etc/passwd',
      'https://user:pass@example.com/x',
    ])
      await expect(publicImageStream(url, new AbortController().signal)).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  it('revalidates redirect destinations and pins guarded agents', async () => {
    get.mockResolvedValueOnce({ status: 302, headers: { location: 'http://127.0.0.1/x' }, data: Readable.from([]) });
    await expect(publicImageStream('https://example.com/x', new AbortController().signal)).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][1]).toMatchObject({ proxy: false, maxRedirects: 0 });
    expect(get.mock.calls[0][1].httpsAgent).toBeTruthy();
  });
  it('does not accept active HTML as an image', () => {
    expect(() => imageExtension(Buffer.from('<html>bad</html>'))).toThrow();
  });
});

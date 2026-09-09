import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { receiveImportUpload } from './upload.js';
const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function fixture(limits = { uploadBytes: 1024, documents: 2 }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-import-upload-'));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const app = express();
  let sequence = 0;
  app.post('/', async (req, res) => {
    try {
      await receiveImportUpload(req, res, path.join(root, String(sequence++)), limits);
      res.json({ files: await Promise.all(req.files.map(async (file) => ({
        name: file.originalname, content: await fs.readFile(file.path, 'utf8'),
      }))) });
    } catch (error) { res.json({ code: error.code }); }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  cleanup.push(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/`;
}
function send(url, entries) {
  const body = new FormData();
  for (const [name, content] of entries) body.append('files', new Blob([content]), name);
  return fetch(url, { method: 'POST', body }).then((r) => r.json());
}
describe('real multipart import uploads', () => {
  it('receives small HTML without losing bytes during asynchronous directory creation', async () => {
    const url = await fixture();
    const content = '<html><body><h1>测试</h1></body></html>';
    for (let i = 0; i < 3; i++)
      expect(await send(url, [['test.html', content]])).toEqual({ files: [{ name: 'test.html', content }] });
  });
  it('accepts multiple documents and retains per-file limits and format checks', async () => {
    const url = await fixture();
    expect((await send(url, [['a.md', '# A'], ['b.html', '<p>B</p>']])).files).toHaveLength(2);
    expect(await send(url, [['large.html', 'x'.repeat(1025)]])).toEqual({ code: 'NOTE_IMPORT_UPLOAD_LIMIT' });
    expect(await send(url, [['bad.exe', 'x']])).toEqual({ code: 'NOTE_IMPORT_UNSUPPORTED_FORMAT' });
    expect(await send(url, [['a.md', 'a'], ['b.md', 'b'], ['c.md', 'c']])).toEqual({ code: 'NOTE_IMPORT_UPLOAD_LIMIT' });
  });
  it('rejects an oversized request before receiving files', async () => {
    const url = await fixture();
    const response = await fetch(url, { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1025) });
    expect(await response.json()).toEqual({ code: 'NOTE_IMPORT_UPLOAD_LIMIT' });
  });
  it('reports truncated multipart data as an incomplete upload', async () => {
    const url = await fixture();
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
      body: '--test\r\nContent-Disposition: form-data; name="files"; filename="a.html"\r\n\r\n<p>incomplete' });
    expect(await response.json()).toEqual({ code: 'NOTE_IMPORT_UPLOAD_INCOMPLETE' });
  });
  it('enforces total request bytes even when content length is absent', async () => {
    const url = await fixture();
    const result = await new Promise((resolve) => {
      const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test' } },
        (res) => { res.resume(); res.on('end', () => resolve('response')); });
      req.on('error', (error) => resolve(error.code));
      // A large preamble exercises the request-wide limit without the per-file limit.
      req.write('x'.repeat(1024 * 1024 + 2048));
      req.end('\r\n--test--\r\n');
    });
    expect(result).toBe('ECONNRESET');
  });
});

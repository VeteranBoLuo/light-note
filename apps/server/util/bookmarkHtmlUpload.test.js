import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));
vi.mock('./sessionStore.js', () => ({}));
vi.mock('./adminContextStore.js', () => ({ getAdminContext: vi.fn(), getAdminContextMetadata: vi.fn() }));
vi.mock('./adminContextAudit.js', () => ({ recordAdminContextAudit: vi.fn() }));
vi.mock('./conversion.js', () => ({ recordConversionEvent: vi.fn() }));

await import('./common.js');
const { createBookmarkHtmlUpload } = await import('./bookmarkHtmlUpload.js');

// 真实走 multipart 上传，确认被拒请求不落盘、超限文件不残留。
let server;
let baseUrl;
let dest;
const received = vi.fn();

beforeAll(async () => {
  dest = await mkdtemp(path.join(os.tmpdir(), 'bookmark-html-upload-'));
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    req.user = role ? { id: role === 'visitor' ? 'visitor-id' : 'owner', role } : undefined;
    next();
  });
  app.post('/import', createBookmarkHtmlUpload({ dest, maxBytes: 1024 }), (req, res) => {
    received(req.file?.size);
    res.send({ status: 200, data: { size: req.file?.size } });
  });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  received.mockReset();
  for (const name of await readdir(dest)) await rm(path.join(dest, name), { force: true });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dest, { recursive: true, force: true });
});

function upload(role, bytes) {
  const form = new FormData();
  form.append('file', new Blob(['x'.repeat(bytes)], { type: 'text/html' }), 'bookmarks.html');
  return fetch(`${baseUrl}/import`, { method: 'POST', body: form, headers: role ? { 'x-test-role': role } : {} }).then(
    (res) => res.json(),
  );
}

describe('书签 HTML 上传', () => {
  it.each([
    ['游客', 'visitor'],
    ['未登录', undefined],
  ])('%s请求在接收文件前被拒绝，不写入临时目录', async (_label, role) => {
    const body = await upload(role, 512);
    expect(body.status).toBe('preview');
    expect(received).not.toHaveBeenCalled();
    expect(await readdir(dest)).toEqual([]);
  });

  it('超过大小上限时返回明确提示并删掉写了一半的文件', async () => {
    const body = await upload('user', 4096);
    expect(body).toMatchObject({ status: 400, msg: '书签文件不能超过 20MB' });
    expect(received).not.toHaveBeenCalled();
    expect(await readdir(dest)).toEqual([]);
  });

  it('登录用户在上限内的文件交给导入处理', async () => {
    const body = await upload('user', 512);
    expect(body).toMatchObject({ status: 200, data: { size: 512 } });
    expect(received).toHaveBeenCalledWith(512);
  });
});

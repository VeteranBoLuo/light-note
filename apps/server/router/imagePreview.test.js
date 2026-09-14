import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), retry: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query: vi.fn().mockResolvedValue([[]]) } }));
vi.mock('../util/imagePreview/service.js', () => ({
  resolveImagePreviews: mocks.resolve,
  retryImagePreview: mocks.retry,
}));

import { baseRouter } from '../util/common.js';

const source = { sourceType: 'note', sourceId: 'note-1' };
const state = { ...source, status: 'ready', url: 'https://preview.test.invalid/image.webp' };
let server;
let baseUrl;

async function request(path, body, { authenticated = true, readOnly = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { 'X-Test-User': 'user-1' } : {}),
      ...(readOnly ? { 'X-Test-Read-Only': 'true' } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

describe('图片预览在 API 代理去除前缀后的路由接入', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (req.headers['x-test-user']) req.user = { id: 'user-1', role: 'user' };
      if (req.headers['x-test-read-only']) req.adminContext = { mode: 'readonly' };
      next();
    });
    for (const item of baseRouter) app.use(item.path, item.router);
    app.use((_req, res) => res.status(404).json({ status: 404 }));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue([state]);
    mocks.retry.mockResolvedValue(state);
  });

  it('查询请求命中预览服务并传递真实身份和刷新选项', async () => {
    expect(await request('/image-previews/resolve', { items: [source], refreshUrl: true })).toMatchObject({
      status: 200,
      body: { status: 200, data: [state] },
    });
    expect(mocks.resolve).toHaveBeenCalledWith('user-1', [source], { readOnly: false, refreshUrl: true });
  });

  it('管理员代看查询保留只读语义', async () => {
    expect(await request('/image-previews/resolve', { items: [source] }, { readOnly: true })).toMatchObject({
      status: 200,
    });
    expect(mocks.resolve).toHaveBeenCalledWith('user-1', [source], { readOnly: true, refreshUrl: false });
  });

  it('重试请求命中服务，管理员代看重试仍被拒绝', async () => {
    expect(await request('/image-previews/retry', { source })).toMatchObject({
      status: 200,
      body: { data: state },
    });
    expect(mocks.retry).toHaveBeenCalledWith('user-1', source);
    mocks.retry.mockClear();
    expect(await request('/image-previews/retry', { source }, { readOnly: true })).toMatchObject({ status: 403 });
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it('未登录请求在匹配的处理器内返回 401', async () => {
    expect(await request('/image-previews/resolve', { items: [source] }, { authenticated: false })).toMatchObject({
      status: 401,
    });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});

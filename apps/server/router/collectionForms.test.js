import express from 'express';
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ publicForm: vi.fn(), submit: vi.fn(), list: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('../util/collectionForms/service.js', () => ({ createFormsService: () => state }));
import ownerRouter, { publicFormsRouter } from './collectionForms.js';
import { buildRequestContext } from '../util/security/requestContext.js';
import { shouldSkipApiLog } from '../util/logPolicy.js';
let server, base;
const auth = vi.fn();
beforeAll(async () => {
  const app = express();
  app.use('/public/forms', publicFormsRouter);
  app.use((req, res, next) => {
    auth();
    if (req.headers['x-test-user']) req.user = { id: 'owner', role: req.headers['x-test-user'] };
    if (req.headers['x-test-admin']) req.adminContext = {};
    next();
  });
  app.use('/toolbox/forms', ownerRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => {
  vi.clearAllMocks();
  state.publicForm.mockResolvedValue({ status: 'collecting', definition: { title: '公开标题' } });
  state.submit.mockResolvedValue({ receipt: 'receipt' });
});
it('公开页忽略登录 Cookie，未知子路径也不进入鉴权', async () => {
  const url = base + '/public/forms/' + 'a'.repeat(48);
  const response = await fetch(url, { headers: { Cookie: 'sid=expired' } });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(auth).not.toHaveBeenCalled();
  expect(await response.json()).toEqual({
    status: 200,
    msg: '',
    data: { status: 'collecting', definition: { title: '公开标题' } },
  });
  expect((await fetch(url + '/statistics')).status).toBe(404);
  expect(auth).not.toHaveBeenCalled();
});
it('公开提交仅返回回执，并限制请求体', async () => {
  const url = base + '/public/forms/' + 'a'.repeat(48) + '/responses';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ requestKey: 'abc', answers: {} }),
  });
  expect((await response.json()).data).toEqual({ receipt: 'receipt' });
  const oversized = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ answer: 'a'.repeat(1100000) }),
  });
  expect(oversized.status).toBe(413);
  expect(auth).not.toHaveBeenCalled();
});
it('管理接口拒绝游客和管理员代入上下文', async () => {
  expect((await fetch(base + '/toolbox/forms')).status).toBe(403);
  expect((await fetch(base + '/toolbox/forms', { headers: { 'x-test-user': 'visitor' } })).status).toBe(403);
  expect(
    (await fetch(base + '/toolbox/forms', { headers: { 'x-test-user': 'root', 'x-test-admin': '1' } })).status,
  ).toBe(403);
  expect(state.list).not.toHaveBeenCalled();
});
it('管理正文与搜索词不进入普通日志或安全证据', () => {
  const url = '/toolbox/forms/id/responses/actions';
  expect(shouldSkipApiLog('/api' + url)).toBe(true);
  const ctx = buildRequestContext({
    method: 'POST',
    path: url,
    originalUrl: url + '?search=private',
    headers: {},
    body: { note: 'SECRET' },
    query: { search: 'SECRET' },
    socket: {},
  });
  expect(JSON.stringify(ctx)).not.toContain('SECRET');
  expect(ctx.originalUrl).not.toContain('search');
  expect(ctx.privateCollection).toBe(true);
});

it('公开提交拒绝缺少或不匹配的 Origin', async () => {
  const url = base + '/public/forms/' + 'a'.repeat(48) + '/responses';
  for (const origin of ['', 'https://unrelated.example']) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: '{}',
    });
    expect(r.status).toBe(403);
  }
  expect(state.submit).not.toHaveBeenCalled();
});

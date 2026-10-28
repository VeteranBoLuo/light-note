import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query } }));
await import('../util/common.js');
const { getAdminUserAvatar, getUserList } = await import('./userHandle.js');

const png = Buffer.concat([
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'),
  Buffer.alloc(24000),
]);
const largeAvatar = `data:image/png;base64,${png.toString('base64')}`;

describe('管理员列表头像', () => {
  let server, origin, actor, storedAvatar, storedRole;
  beforeAll(async () => {
    const app = express();
    app.get('/api/user/admin/avatar', (req, res) => {
      req.user = actor;
      return getAdminUserAvatar(req, res);
    });
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  beforeEach(() => {
    actor = { id: 'root-current', role: 'root' };
    storedRole = { role: 'root', del_flag: '0' };
    storedAvatar = largeAvatar;
    query.mockReset().mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT role,del_flag')) return [[storedRole]];
      return [[{ head_picture: storedAvatar }]];
    });
  });

  async function list(rows, limit = 50) {
    query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT u.id')) return [rows.map((row) => ({ ...row }))];
      if (sql.startsWith('SELECT COUNT(*) AS total')) return [[{ total: rows.length }]];
      return [[]];
    });
    let payload;
    await getUserList(
      { user: actor, body: { cursor: null, limit, sort: { field: 'lastActiveTime' } } },
      {
        send(value) {
          payload = value;
        },
      },
    );
    expect(payload.status).toBe(200);
    return payload.data;
  }

  it('大图转为稳定版本 URL，分页、总数和其余头像格式均保留', async () => {
    const sources = [
      largeAvatar,
      'data:image/png;base64,AA==',
      'https://example.test/avatar.png',
      '<svg></svg>',
      'data:image/svg+xml;base64,PHN2Zy8+',
      null,
    ];
    const rows = sources.map((head_picture, n) => ({
      id: `target-${n}`,
      head_picture,
      create_time: '2026-10-20 10:00:00',
      last_active_time: null,
    }));
    const result = await list(rows);
    expect(result.items.slice(1).map((row) => row.headPicture)).toEqual(sources.slice(1));
    expect(result.items[0].headPicture).toMatch(/^\/api\/user\/admin\/avatar\?userId=target-0&v=[a-f0-9]{16}$/);
    expect(result.total).toBe(6);
    const repeat = await list(rows);
    expect(repeat.items[0].headPicture).toBe(result.items[0].headPicture);
    rows[0].head_picture = largeAvatar.replace('image/png', 'image/jpeg');
    expect((await list(rows)).items[0].headPicture).not.toBe(result.items[0].headPicture);
    const page = await list(rows, 2);
    expect(page.items.map((row) => row.id)).toEqual(['target-0', 'target-1']);
    expect(page).toMatchObject({ total: 6, hasMore: true });
    expect(page.nextCursor).toBeTruthy();
  });

  it('独立图片请求保留原始字节，并用 ETag 重验证；停用目标也能查看', async () => {
    const response = await fetch(`${origin}/api/user/admin/avatar?userId=banned-target`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(query.mock.calls[1][1]).toEqual([1024 * 1024, 'banned-target']);
    const cached = await fetch(`${origin}/api/user/admin/avatar?userId=banned-target`, {
      headers: { 'If-None-Match': response.headers.get('etag'), 'Cache-Control': 'max-age=0' },
    });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
    // 304 也读取当前 Root 身份和当前头像，更新或撤权后不能复用旧响应。
    expect(query.mock.calls.filter(([sql]) => sql.startsWith('SELECT role,del_flag'))).toHaveLength(2);
    storedAvatar = largeAvatar.replace('image/png', 'image/jpeg');
    const changed = await fetch(`${origin}/api/user/admin/avatar?userId=banned-target`, {
      headers: { 'If-None-Match': response.headers.get('etag'), 'Cache-Control': 'max-age=0' },
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(response.headers.get('etag'));
    await changed.arrayBuffer();
  });

  it.each([undefined, { id: 'ordinary', role: 'user' }])('非 Root 不能读取或通过条件请求绕过权限：%j', async (user) => {
    actor = user;
    const response = await fetch(`${origin}/api/user/admin/avatar?userId=target`, {
      headers: { 'If-None-Match': '*', 'Cache-Control': 'max-age=0' },
    });
    expect((await response.json()).status).toBe(403);
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { role: 'user', del_flag: '0' },
    { role: 'root', del_flag: '1' },
  ])('Root 撤权或停用后不再返回图片或 304：%j', async (role) => {
    storedRole = role;
    const response = await fetch(`${origin}/api/user/admin/avatar?userId=target`, {
      headers: { 'If-None-Match': '*', 'Cache-Control': 'max-age=0' },
    });
    expect((await response.json()).status).toBe(403);
    expect(response.status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'a'.repeat(256)])('拒绝缺失或过长的目标 ID', async (userId) => {
    const response = await fetch(`${origin}/api/user/admin/avatar?userId=${userId}`);
    expect(response.status).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    'https://example.test/avatar.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png;base64,!',
    `data:image/png;base64,${'A'.repeat(1024 * 1024)}`,
  ])('缺失、非栅格、无效或超大内容不作为图片输出（样例 %$）', async (source) => {
    storedAvatar = source;
    const response = await fetch(`${origin}/api/user/admin/avatar?userId=target`);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock 掉 db 连接池,避免 import conversion.js 时连真实数据库
const query = vi.fn().mockResolvedValue([[]]);
vi.mock('../db/index.js', () => ({ default: { query } }));

const { recordConversionEvent, recordFirstOwnResource, normalizeConversionSource } = await import('./conversion.js');

describe('recordConversionEvent', () => {
  beforeEach(() => query.mockClear());

  it('visitor_type 取 req.user.role,fingerprint 取请求头,参数顺序正确', () => {
    const req = { user: { id: 'u1', role: 'visitor' }, headers: { fingerprint: 'fp1' } };
    recordConversionEvent(req, 'wall_hit', '/api/x');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO conversion_events');
    // params: [fingerprint, userId, visitorType, event, context, ip]
    expect(params[0]).toBe('fp1');
    expect(params[1]).toBe('u1');
    expect(params[2]).toBe('visitor');
    expect(params[3]).toBe('wall_hit');
    expect(params[4]).toBe('/api/x');
  });

  it('overrides 覆盖 userId / visitorType;无 fingerprint 头时为空串', () => {
    const req = { user: { id: 'u1', role: 'visitor' }, headers: {} };
    recordConversionEvent(req, 'register', '', { userId: 'newU', visitorType: 'admin' });
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe('');
    expect(params[1]).toBe('newU');
    expect(params[2]).toBe('admin');
    expect(params[3]).toBe('register');
  });

  it('event 名超长截断到 64', () => {
    const req = { user: { role: 'visitor' }, headers: {} };
    recordConversionEvent(req, 'x'.repeat(100), '');
    const [, params] = query.mock.calls[0];
    expect(params[3].length).toBe(64);
  });

  it('无 req.user 时 visitor_type 兜底为 visitor', () => {
    recordConversionEvent({ headers: {} }, 'page_view', '');
    const [, params] = query.mock.calls[0];
    expect(params[2]).toBe('visitor');
    expect(params[1]).toBe(null);
  });
});

describe('recordFirstOwnResource(激活里程碑)', () => {
  beforeEach(() => query.mockReset());

  it('未激活过 → 查存在性 + 写一次 first_own_resource(context=type)', async () => {
    query.mockResolvedValueOnce([[]]); // SELECT 存在性:空
    query.mockResolvedValueOnce([[]]); // INSERT
    await recordFirstOwnResource({ user: { id: 'u1', role: 'admin' }, headers: {} }, 'bookmark');
    expect(query).toHaveBeenCalledTimes(2);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('INSERT INTO conversion_events');
    expect(params[3]).toBe('first_own_resource'); // event
    expect(params[4]).toBe('bookmark'); // context = type
  });

  it('已激活过 → 不重复写(只有存在性查询)', async () => {
    query.mockResolvedValueOnce([[{ '1': 1 }]]); // SELECT 存在性:已有记录
    await recordFirstOwnResource({ user: { id: 'u1', role: 'admin' }, headers: {} }, 'note');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('无 userId → 直接返回,不查库', async () => {
    await recordFirstOwnResource({ user: {}, headers: {} }, 'file');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('normalizeConversionSource(渠道 source 白名单)', () => {
  it('白名单命中原样返回', () => {
    expect(normalizeConversionSource('write_add_bookmark')).toBe('write_add_bookmark');
    expect(normalizeConversionSource('nav')).toBe('nav');
    expect(normalizeConversionSource('auth_switch')).toBe('auth_switch');
  });
  it('非白名单/脏值/空/超长一律降级 unknown', () => {
    expect(normalizeConversionSource('/api/bookmark/add?token=x')).toBe('unknown'); // URL 不落库
    expect(normalizeConversionSource('add-bookmark')).toBe('unknown'); // 撞墙操作名不是渠道 source
    expect(normalizeConversionSource('')).toBe('unknown');
    expect(normalizeConversionSource(undefined)).toBe('unknown');
    expect(normalizeConversionSource('x'.repeat(100))).toBe('unknown');
  });
});

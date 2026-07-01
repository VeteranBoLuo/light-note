import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock 掉 db 连接池,避免 import conversion.js 时连真实数据库
const query = vi.fn().mockResolvedValue([[]]);
vi.mock('../db/index.js', () => ({ default: { query } }));

const { recordConversionEvent } = await import('./conversion.js');

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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock db 连接池(可断言 query 调用),redis/nodemailer 由 vitest.setup.js 全局 mock
const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection: vi.fn() } }));

// common.js ↔ router/common.js ↔ commonHandle.js 存在循环依赖:
// 直接首个 import commonHandle.js 会拿到未初始化的导出而报错。
// 先按应用真实顺序 import common.js,让 commonHandle.js 作为叶子完成初始化,规避循环。
await import('../util/common.js');
const { recordConversion, getConversionFunnel } = await import('./commonHandle.js');

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}

describe('recordConversion 白名单', () => {
  beforeEach(() => query.mockReset());

  it('非白名单事件返回 400,不写库', () => {
    const res = mockRes();
    recordConversion({ user: { role: 'visitor' }, headers: {}, body: { event: 'hack' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('已登录用户(非游客)不计入漏斗,不写库', () => {
    const res = mockRes();
    recordConversion({ user: { id: 'u', role: 'admin' }, headers: {}, body: { event: 'page_view' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('游客 + 白名单事件(wall_hit)→ 写库', () => {
    query.mockResolvedValue([[]]);
    const res = mockRes();
    recordConversion(
      { user: { id: 'v', role: 'visitor' }, headers: { fingerprint: 'fp' }, body: { event: 'wall_hit', source: '/x' } },
      res,
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO conversion_events');
  });

  it('新增事件 register_view 已在白名单内', () => {
    query.mockResolvedValue([[]]);
    const res = mockRes();
    recordConversion({ user: { role: 'visitor' }, headers: {}, body: { event: 'register_view' } }, res);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('getConversionFunnel', () => {
  beforeEach(() => query.mockReset());

  it('非 root 返回 403', async () => {
    const res = mockRes();
    await getConversionFunnel({ user: { role: 'visitor' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('root 返回五段漏斗,含 registerViewVisitors(回归:register_view 已被看板消费)', async () => {
    query.mockImplementation((sql) => {
      if (/GROUP BY event/.test(sql)) {
        return Promise.resolve([
          [
            { event: 'page_view', visitors: 10 },
            { event: 'wall_hit', visitors: 6 },
            { event: 'cta_click', visitors: 3 },
            { event: 'register_view', visitors: 2 },
            { event: 'register', visitors: 1 },
          ],
        ]);
      }
      if (/DISTINCT ip/.test(sql)) return Promise.resolve([[{ ips: 4 }]]);
      return Promise.resolve([[{ context: 'add-bookmark', cnt: 5 }]]); // hotspots
    });
    const res = mockRes();
    await getConversionFunnel({ user: { role: 'root' } }, res);
    const arg = res.send.mock.calls[0][0];
    expect(arg.status).toBe(200);
    expect(arg.data).toMatchObject({
      pageViewVisitors: 10,
      wallHitVisitors: 6,
      ctaClickVisitors: 3,
      registerViewVisitors: 2,
      registerVisitors: 1,
      uniqueIps: 4,
    });
    expect(arg.data.hotspots).toEqual([{ context: 'add-bookmark', cnt: 5 }]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock db 连接池(可断言 query 调用),redis/nodemailer 由 vitest.setup.js 全局 mock
const query = vi.fn();
const getConnection = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection } }));

// common.js ↔ router/common.js ↔ commonHandle.js 存在循环依赖:
// 直接首个 import commonHandle.js 会拿到未初始化的导出而报错。
// 先按应用真实顺序 import common.js,让 commonHandle.js 作为叶子完成初始化,规避循环。
await import('../util/common.js');
const { recordConversion, recordOperationLogs, analyzeImgUrl, getConversionFunnel, clearLogsByIp, getIpLogStats } = await import('./commonHandle.js');

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
});

describe('recordOperationLogs 管理员预览审计', () => {
  beforeEach(() => query.mockReset());

  it('普通用户预览不能伪造操作日志', () => {
    const res = mockRes();
    recordOperationLogs(
      {
        isAdminPreview: true,
        isVisitorWorkspace: false,
        user: { id: 'user-1', role: 'user' },
        body: { module: '笔记库', operation: '修改笔记' },
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('游客维护日志记录真实 root，并在操作中保留目标游客', async () => {
    query.mockResolvedValue([{}]);
    const res = mockRes();
    recordOperationLogs(
      {
        isAdminPreview: true,
        isVisitorWorkspace: true,
        adminActor: { id: 'root-1', role: 'root' },
        user: { id: 'visitor-1', role: 'visitor' },
        headers: {},
        body: { module: '笔记库', operation: '保存笔记' },
        ip: '127.0.0.1',
      },
      res,
    );
    await vi.waitFor(() => expect(res.send).toHaveBeenCalled());
    expect(query).toHaveBeenCalledTimes(1);
    const inserted = query.mock.calls[0][1][0];
    expect(inserted.create_by).toBe('root-1');
    expect(inserted.module).toBe('游客内容维护/笔记库');
    expect(inserted.operation).toContain('visitor-1');
  });
});

describe('analyzeImgUrl 写权限与归属', () => {
  beforeEach(() => {
    query.mockReset();
    getConnection.mockReset();
  });

  it('普通游客浏览时静默跳过图标写入', async () => {
    const res = mockRes();
    await analyzeImgUrl(
      { user: { id: 'visitor-1', role: 'visitor' }, body: [{ id: 'bookmark-1', noCache: true }] },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200, data: [] }));
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('普通用户预览不能触发图标写入', async () => {
    const res = mockRes();
    await analyzeImgUrl(
      {
        isAdminPreview: true,
        isVisitorWorkspace: false,
        user: { id: 'user-1', role: 'user' },
        body: [{ id: 'bookmark-1', noCache: true }],
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('登录用户只按自己的 user_id 查询待更新书签，且不信任客户端 URL', async () => {
    const connection = { query: vi.fn().mockResolvedValue([[]]), release: vi.fn() };
    getConnection.mockResolvedValue(connection);
    const res = mockRes();
    await analyzeImgUrl(
      {
        user: { id: 'user-1', role: 'user' },
        body: [{ id: 'bookmark-1', url: 'http://attacker.invalid', noCache: true }],
      },
      res,
    );
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('WHERE user_id = ?');
    expect(connection.query.mock.calls[0][1]).toEqual(['user-1', 'bookmark-1']);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});

describe('getConversionFunnel', () => {
  beforeEach(() => query.mockReset());

  it('非 root 返回 403', async () => {
    const res = mockRes();
    await getConversionFunnel({ user: { role: 'visitor' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('root 返回漏斗各段访客数(按 fingerprint 去重)', async () => {
    query.mockImplementation((sql) => {
      if (/GROUP BY event/.test(sql)) {
        return Promise.resolve([
          [
            { event: 'page_view', visitors: 10 },
            { event: 'wall_hit', visitors: 6 },
            { event: 'cta_click', visitors: 3 },
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
      registerVisitors: 1,
      uniqueIps: 4,
    });
    expect(arg.data.hotspots).toEqual([{ context: 'add-bookmark', cnt: 5 }]);
  });

  it('返回分享/激活字段,且时间窗参数下推到查询', async () => {
    const calls = [];
    query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      if (/GROUP BY event/.test(sql)) {
        return Promise.resolve([
          [
            { event: 'page_view', visitors: 10 },
            { event: 'share_view', visitors: 7 },
            { event: 'share_cta_click', visitors: 2 },
          ],
        ]);
      }
      if (/DISTINCT ip/.test(sql)) return Promise.resolve([[{ ips: 4 }]]);
      if (/first_own_resource/.test(sql)) return Promise.resolve([[{ activated: 5 }]]);
      if (/DATE_FORMAT/.test(sql)) return Promise.resolve([[{ d: '2026-07-01', pv: 10, cta: 3, reg: 1 }]]);
      return Promise.resolve([[]]); // hotspots
    });
    const res = mockRes();
    await getConversionFunnel({ user: { role: 'root' }, body: { startDate: '2026-06-01', endDate: '2026-06-30' } }, res);
    const arg = res.send.mock.calls[0][0];
    expect(arg.data).toMatchObject({ shareViewVisitors: 7, shareCtaClickVisitors: 2, activatedUsers: 5 });
    expect(arg.data.trend).toEqual([{ d: '2026-07-01', pv: 10, cta: 3, reg: 1 }]);
    const funnelCall = calls.find((c) => /GROUP BY event/.test(c.sql));
    expect(funnelCall.sql).toContain('create_time');
    expect(funnelCall.params).toEqual(['2026-06-01 00:00:00', '2026-06-30']);
  });
});

describe('clearLogsByIp 按 IP 清理(破坏性边界)', () => {
  beforeEach(() => query.mockReset());

  it('非 root → 403,不执行任何删除', async () => {
    const res = mockRes();
    await clearLogsByIp({ user: { id: 'u', role: 'visitor' }, body: { mode: 'local' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('root + exact 模式空 ip → 400,不执行删除(防 WHERE 恒真全表删)', async () => {
    query.mockImplementation((sql) => {
      if (/FROM user/.test(sql)) return Promise.resolve([[{ role: 'root' }]]);
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await clearLogsByIp({ user: { id: 'r', role: 'root' }, body: { ip: '   ' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query.mock.calls.every((c) => !/DELETE/.test(c[0]))).toBe(true);
  });

  it('root + local 模式 → 三表 DELETE,WHERE 为常量、params 为空(不含用户输入)', async () => {
    query.mockImplementation((sql) => {
      if (/FROM user/.test(sql)) return Promise.resolve([[{ role: 'root' }]]);
      if (/DELETE FROM/.test(sql)) return Promise.resolve([{ affectedRows: 2 }]);
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await clearLogsByIp({ user: { id: 'r', role: 'root' }, body: { mode: 'local' } }, res);
    const deletes = query.mock.calls.filter((c) => /DELETE FROM/.test(c[0]));
    expect(deletes).toHaveLength(3);
    deletes.forEach((c) => {
      expect(c[0]).toContain("LOWER(ip)='::1'");
      expect(c[1]).toEqual([]);
    });
    const arg = res.send.mock.calls[0][0];
    expect(arg.status).toBe(200);
    expect(arg.data).toMatchObject({ apiLogs: 2, conversionEvents: 2, operationLogs: 2 });
  });

  it('root + exact 模式 → 三表 DELETE 均以 ip=? 参数化绑定该 IP', async () => {
    query.mockImplementation((sql) => {
      if (/FROM user/.test(sql)) return Promise.resolve([[{ role: 'root' }]]);
      if (/DELETE FROM/.test(sql)) return Promise.resolve([{ affectedRows: 1 }]);
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await clearLogsByIp({ user: { id: 'r', role: 'root' }, body: { ip: '1.2.3.4' } }, res);
    const deletes = query.mock.calls.filter((c) => /DELETE FROM/.test(c[0]));
    expect(deletes).toHaveLength(3);
    deletes.forEach((c) => {
      expect(c[0]).toContain('ip = ?');
      expect(c[1]).toEqual(['1.2.3.4']);
    });
  });
});

describe('getIpLogStats 统计', () => {
  beforeEach(() => query.mockReset());

  it('非 root → 403', async () => {
    const res = mockRes();
    await getIpLogStats({ user: { role: 'visitor' }, body: { mode: 'local' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('root + local → 返回驼峰统计字段(对齐 resultData 的 camelCaseKeys)', async () => {
    query.mockImplementation((sql) => {
      if (/FROM user/.test(sql)) return Promise.resolve([[{ role: 'root' }]]);
      if (/COUNT\(\*\)/.test(sql)) return Promise.resolve([[{ n: 5 }]]);
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await getIpLogStats({ user: { id: 'r', role: 'root' }, body: { mode: 'local' } }, res);
    const arg = res.send.mock.calls[0][0];
    expect(arg.status).toBe(200);
    expect(arg.data).toMatchObject({ apiLogs: 5, conversionEvents: 5, operationLogs: 5 });
  });

  it('root + exact 空 ip → 400', async () => {
    query.mockImplementation((sql) => {
      if (/FROM user/.test(sql)) return Promise.resolve([[{ role: 'root' }]]);
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await getIpLogStats({ user: { id: 'r', role: 'root' }, body: {} }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock db 连接池(可断言 query 调用),redis/nodemailer 由 vitest.setup.js 全局 mock
const query = vi.fn();
const getConnection = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection } }));

// clearImages 用:文件删除与引用集合均可控
const { unlinkSpy, collectUsedSpy } = vi.hoisted(() => ({ unlinkSpy: vi.fn(), collectUsedSpy: vi.fn() }));
vi.mock('fs/promises', () => ({ default: { unlink: unlinkSpy } }));
vi.mock('../util/noteImages.js', () => ({ collectUsedImageNames: collectUsedSpy }));

// common.js ↔ router/common.js ↔ commonHandle.js 存在循环依赖:
// 直接首个 import commonHandle.js 会拿到未初始化的导出而报错。
// 先按应用真实顺序 import common.js,让 commonHandle.js 作为叶子完成初始化,规避循环。
await import('../util/common.js');
const {
  recordConversion,
  recordOperationLogs,
  analyzeImgUrl,
  getConversionFunnel,
  clearLogsByIp,
  getIpLogStats,
  getAgentLogsSummary,
  clearImages,
  resolveHelpSources,
} = await import('./commonHandle.js');

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

  it('游客 + v1.1 新事件(demo_enter/signup_open/signup_submit)→ 均写库', () => {
    for (const event of ['demo_enter', 'signup_open', 'signup_submit']) {
      query.mockReset();
      query.mockResolvedValue([[]]);
      const res = mockRes();
      recordConversion(
        { user: { role: 'visitor' }, headers: { fingerprint: 'fp' }, body: { event, source: 'nav' } },
        res,
      );
      expect(query, `${event} 应写库`).toHaveBeenCalledTimes(1);
    }
  });

  it('后端专属事件(register/first_own_resource/signup_failed)不接受客户端上报 → 400', () => {
    for (const event of ['register', 'first_own_resource', 'signup_failed']) {
      query.mockReset();
      const res = mockRes();
      recordConversion({ user: { role: 'visitor' }, headers: {}, body: { event } }, res);
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(query, `${event} 不应写库`).not.toHaveBeenCalled();
    }
  });

  it('渠道事件(signup_open)非法 source 降级 unknown,不落原始脏值', () => {
    query.mockReset();
    query.mockResolvedValue([[]]);
    const res = mockRes();
    recordConversion(
      {
        user: { role: 'visitor' },
        headers: { fingerprint: 'fp' },
        body: { event: 'signup_open', source: '/api/x?token=secret' },
      },
      res,
    );
    // params: [fingerprint, userId, visitorType, event, context, ip];context(第 5 个)应为归一后的 unknown
    expect(query.mock.calls[0][1][4]).toBe('unknown');
  });

  it('wall_hit 的 context 保留原始操作名(撞墙操作是另一维度,不套渠道白名单)', () => {
    query.mockReset();
    query.mockResolvedValue([[]]);
    const res = mockRes();
    recordConversion(
      {
        user: { role: 'visitor' },
        headers: { fingerprint: 'fp' },
        body: { event: 'wall_hit', source: 'add-bookmark' },
      },
      res,
    );
    expect(query.mock.calls[0][1][4]).toBe('add-bookmark');
  });
});

describe('resolveHelpSources 旧来源安全补全', () => {
  beforeEach(() => query.mockReset());

  it('普通用户只补全帮助中心公开文章，并忽略非帮助文章和重名来源', async () => {
    query.mockResolvedValueOnce([
      [
        { id: 'help-1', title: '唯一帮助', category: '帮助中心', status: 'public' },
        { id: 'faq-1', title: '公开 FAQ', category: 'FAQ', status: 'public' },
        { id: 'duplicate-1', title: '重名帮助', category: '帮助中心', status: 'public' },
        { id: 'duplicate-2', title: '重名帮助', category: '帮助中心', status: 'public' },
      ],
    ]);
    const res = mockRes();

    await resolveHelpSources({ user: { role: 'user' }, body: { titles: ['唯一帮助', '公开 FAQ', '重名帮助'] } }, res);

    expect(query.mock.calls[0][0]).toContain("status = 'public'");
    expect(query.mock.calls[0][0]).toContain("category = '帮助中心'");
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: [expect.objectContaining({ id: 'help-1', target: 'help-article' })],
      }),
    );
  });

  it('root 可以把内部知识补成管理员知识库深链', async () => {
    query.mockResolvedValueOnce([[{ id: 'internal-1', title: '内部手册', category: '运维', status: 'internal' }]]);
    const res = mockRes();

    await resolveHelpSources({ user: { role: 'root' }, body: { titles: ['内部手册'] } }, res);

    expect(query.mock.calls[0][0]).not.toContain("status = 'public'");
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: [expect.objectContaining({ id: 'internal-1', target: 'knowledge-admin' })],
      }),
    );
  });

  it('拒绝非数组标题参数', async () => {
    const res = mockRes();
    await resolveHelpSources({ user: { role: 'user' }, body: { titles: '帮助' } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query).not.toHaveBeenCalled();
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
            { event: 'demo_enter', visitors: 8 },
            { event: 'wall_hit', visitors: 6 },
            { event: 'signup_open', visitors: 4 },
            { event: 'signup_submit', visitors: 2 },
            { event: 'register', visitors: 1 },
            { event: 'signup_failed', visitors: 1 },
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
      demoEnterVisitors: 8,
      wallHitVisitors: 6,
      signupOpenVisitors: 4,
      signupSubmitVisitors: 2,
      registerVisitors: 1,
      signupFailedVisitors: 1,
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
      if (/DATE_FORMAT/.test(sql)) return Promise.resolve([[{ d: '2026-07-01', pv: 10, signupOpen: 3, reg: 1 }]]);
      return Promise.resolve([[]]); // hotspots
    });
    const res = mockRes();
    await getConversionFunnel(
      { user: { role: 'root' }, body: { startDate: '2026-06-01', endDate: '2026-06-30' } },
      res,
    );
    const arg = res.send.mock.calls[0][0];
    expect(arg.data).toMatchObject({ shareViewVisitors: 7, shareCtaClickVisitors: 2, activatedUsers: 5 });
    expect(arg.data.trend).toEqual([{ d: '2026-07-01', pv: 10, signupOpen: 3, reg: 1 }]);
    const funnelCall = calls.find((c) => /GROUP BY event/.test(c.sql));
    expect(funnelCall.sql).toContain('create_time');
    expect(funnelCall.params).toEqual(['2026-06-01 00:00:00', '2026-06-30']);
  });

  it('激活按 register cohort 关联(JOIN),空 fingerprint 不计入访客,返回无法归因与失败原因分布', async () => {
    query.mockImplementation((sql) => {
      if (/GROUP BY event/.test(sql)) return Promise.resolve([[{ event: 'register', visitors: 3 }]]);
      if (/DISTINCT ip/.test(sql)) return Promise.resolve([[{ ips: 2 }]]);
      if (/JOIN conversion_events f/.test(sql)) return Promise.resolve([[{ activated: 2 }]]); // cohort:只算本期注册用户的激活
      if (/fingerprint = ''/.test(sql)) return Promise.resolve([[{ cnt: 7 }]]); // 无法归因
      if (/event = 'signup_failed'/.test(sql)) return Promise.resolve([[{ reason: 'email_exists', cnt: 4 }]]); // 失败分布
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await getConversionFunnel({ user: { role: 'root' } }, res);
    const arg = res.send.mock.calls[0][0];
    expect(arg.data.activatedUsers).toBe(2);
    expect(arg.data.unattributedEvents).toBe(7);
    expect(arg.data.signupFailReasons).toEqual([{ reason: 'email_exists', cnt: 4 }]);
    // 主漏斗只算非空 fingerprint(空 fingerprint 不被 COUNT DISTINCT 合并成虚假访客)
    const funnelSql = query.mock.calls.map((c) => c[0]).find((s) => /GROUP BY event/.test(s));
    expect(funnelSql).toContain("fingerprint <> ''");
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

describe('getAgentLogsSummary AI 质量指标', () => {
  beforeEach(() => query.mockReset());

  it('计算错误率、延迟分位、工具质量和确认比例', async () => {
    query.mockImplementation((sql) => {
      if (/SELECT COUNT\(\*\).*created_at >=/.test(sql)) {
        return Promise.resolve([[{ count: 3, tokens: 120, cost: 0.02 }]]);
      }
      if (/SELECT COUNT\(\*\).*WHERE 1=1/.test(sql)) {
        return Promise.resolve([[{ count: 10, tokens: 500, cost: 0.1 }]]);
      }
      if (/SELECT a\.status, a\.duration_ms/.test(sql)) {
        return Promise.resolve([
          [
            {
              status: 'success',
              duration_ms: 100,
              first_token_ms: 30,
              planner_ms: 20,
              tool_ms: 10,
              final_ms: 70,
              task_type: 'agent',
              tools_used: '[{"name":"query_notes","status":"success"}]',
            },
            {
              status: 'error',
              duration_ms: 900,
              first_token_ms: null,
              planner_ms: 100,
              tool_ms: 50,
              final_ms: null,
              task_type: 'agent',
              tools_used: '[{"name":"query_notes","status":"error"}]',
            },
            {
              status: 'success',
              duration_ms: 300,
              first_token_ms: 80,
              planner_ms: null,
              tool_ms: null,
              final_ms: 300,
              task_type: 'agent_confirmation',
              tools_used: null,
            },
            {
              status: 'confirmation_rejected',
              duration_ms: 200,
              first_token_ms: null,
              planner_ms: null,
              tool_ms: null,
              final_ms: null,
              task_type: 'agent_confirmation',
              tools_used: null,
            },
          ],
        ]);
      }
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await getAgentLogsSummary({ user: { role: 'root' }, body: { hideInternal: false } }, res);
    const payload = res.send.mock.calls[0][0];
    expect(payload.status).toBe(200);
    expect(payload.data.quality).toMatchObject({
      sampleCount: 4,
      errorRate: 25,
      durationP50: 200,
      durationP95: 900,
      firstTokenP50: 30,
      toolHitRate: 50,
      toolErrorRate: 50,
      confirmationRate: 50,
    });
  });
});

describe('clearImages 服务端校验与失败上报', () => {
  const rootReq = (images) => ({ user: { id: 'root-1', role: 'root' }, body: { images } });
  beforeEach(() => {
    query.mockReset();
    unlinkSpy.mockReset();
    collectUsedSpy.mockReset();
    // ensureRootRole 的复核查询
    query.mockResolvedValue([[{ role: 'root', del_flag: 0 }]]);
    collectUsedSpy.mockResolvedValue(new Set());
    unlinkSpy.mockResolvedValue();
  });

  it('仍被引用的图片被跳过,不执行删除', async () => {
    collectUsedSpy.mockResolvedValue(new Set(['note-1-used']));
    const res = mockRes();
    await clearImages(rootReq([{ fullFileName: 'note-1-used.png' }]), res);
    expect(unlinkSpy).not.toHaveBeenCalled();
    const sent = res.send.mock.calls.at(-1)[0];
    expect(sent.status).toBe(200);
    expect(sent.data.skipped).toEqual(['note-1-used.png']);
    expect(sent.msg).toContain('仍被引用');
  });

  it('全部删除失败时返回 500,不谎报成功', async () => {
    unlinkSpy.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    const res = mockRes();
    await clearImages(rootReq([{ fullFileName: 'a.png' }, { fullFileName: 'b.png' }]), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const sent = res.send.mock.calls.at(-1)[0];
    expect(sent.data.failed).toEqual(['a.png', 'b.png']);
  });

  it('部分失败时 200 但消息如实报告,ENOENT 视为幂等成功', async () => {
    unlinkSpy
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
      .mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    const res = mockRes();
    await clearImages(
      rootReq([{ fullFileName: 'a.png' }, { fullFileName: 'gone.png' }, { fullFileName: 'c.png' }]),
      res,
    );
    const sent = res.send.mock.calls.at(-1)[0];
    expect(sent.status).toBe(200);
    expect(sent.data.deleted).toEqual(['a.png', 'gone.png']);
    expect(sent.data.failed).toEqual(['c.png']);
    expect(sent.msg).toContain('删除失败');
  });

  it('路径穿越被 basename 归一,只删图片目录内文件', async () => {
    const res = mockRes();
    await clearImages(rootReq([{ fullFileName: '../../etc/passwd' }]), res);
    expect(unlinkSpy).toHaveBeenCalledTimes(1);
    const target = unlinkSpy.mock.calls[0][0];
    expect(target).toBe('/www/wwwroot/images/passwd');
  });

  it('非 root 直接拒绝', async () => {
    const res = mockRes();
    await clearImages({ user: { id: 'u1', role: 'user' }, body: { images: [{ fullFileName: 'a.png' }] } }, res);
    expect(unlinkSpy).not.toHaveBeenCalled();
    const sent = res.send.mock.calls.at(-1)[0];
    expect(sent.status).toBe(403);
  });
});

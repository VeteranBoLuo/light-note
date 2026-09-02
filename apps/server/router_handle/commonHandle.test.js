import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock db 连接池(可断言 query 调用),redis/nodemailer 由 vitest.setup.js 全局 mock
const query = vi.fn();
const getConnection = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection } }));

// clearImages 用:文件删除与引用集合均可控
const { unlinkSpy, collectUsedSpy, deleteThumbnailSpy } = vi.hoisted(() => ({
  unlinkSpy: vi.fn(),
  collectUsedSpy: vi.fn(),
  deleteThumbnailSpy: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  default: {
    unlink: unlinkSpy,
  },
}));
vi.mock('../util/noteImages.js', () => ({ collectUsedImageNames: collectUsedSpy }));
vi.mock('../util/noteImageThumbnail.js', () => ({ deleteNoteImageThumbnail: deleteThumbnailSpy }));
const { mockProcessBookmarkIcons, mockIsBookmarkIconCheckRecent } = vi.hoisted(() => ({
  mockProcessBookmarkIcons: vi.fn().mockResolvedValue([]),
  mockIsBookmarkIconCheckRecent: vi.fn((checkedAt, now = Date.now()) => {
    if (!checkedAt) return false;
    const timestamp = checkedAt instanceof Date ? checkedAt.getTime() : Date.parse(String(checkedAt).replace(' ', 'T'));
    const cooldownMs = 60 * 60 * 1000;
    return Number.isFinite(timestamp) && now - timestamp < cooldownMs;
  }),
}));
vi.mock('../util/bookmarkIconService.js', () => ({
  processBookmarkIcons: mockProcessBookmarkIcons,
  isBookmarkIconCheckRecent: mockIsBookmarkIconCheckRecent,
}));

const { queryDeepSeekBalanceSpy, getDailyBalanceChangeSpy } = vi.hoisted(() => ({
  queryDeepSeekBalanceSpy: vi.fn(),
  getDailyBalanceChangeSpy: vi.fn(),
}));
vi.mock('../util/agent/providerBalance.js', () => ({ getDeepSeekBalance: queryDeepSeekBalanceSpy }));
vi.mock('../util/agent/providerBalanceSnapshot.js', () => ({
  getDeepSeekDailyBalanceChange: getDailyBalanceChangeSpy,
}));

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
  getDeepSeekBalance,
  getAgentLogsSummary,
  getAiFeedback,
  clearImages,
  getHelpConfig,
  resolveHelpSources,
  getAdminOverview,
  getAdminOverviewSnapshot,
  getAdminOverviewRecent,
  getAdminOverviewTrend,
  getAgentLogs,
  getApiLogDetail,
  getApiLogs,
  getOperationLogs,
} = await import('./commonHandle.js');
const processBookmarkIcons = mockProcessBookmarkIcons;
const isBookmarkIconCheckRecent = mockIsBookmarkIconCheckRecent;

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}

describe('getHelpConfig 帮助栏目元数据', () => {
  beforeEach(() => query.mockReset());

  it('只返回公开未归档帮助文章，并把 help_section 暴露为 helpSection', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 'help-1',
          title: '笔记指南',
          content: '<p>正文</p>',
          sort: 1,
          help_section: '笔记与编辑',
        },
      ],
    ]);
    const res = mockRes();

    await getHelpConfig({}, res);

    expect(query.mock.calls[0][0]).toContain('help_section');
    expect(query.mock.calls[0][0]).toContain('COALESCE(admin_archived, 0) = 0');
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: [expect.objectContaining({ id: 'help-1', helpSection: '笔记与编辑' })],
      }),
    );
  });

  it('迁移前遗留的空栏目稳定归入其他帮助', async () => {
    query.mockResolvedValueOnce([[{ id: 'help-1', title: '旧文章', content: '', sort: 1, help_section: null }]]);
    const res = mockRes();

    await getHelpConfig({}, res);

    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ helpSection: '其他帮助' })] }),
    );
  });
});

describe('getDeepSeekBalance 余额主指标', () => {
  beforeEach(() => {
    query.mockReset();
    queryDeepSeekBalanceSpy.mockReset();
    getDailyBalanceChangeSpy.mockReset();
  });

  it('同时返回当前余额与当天余额变化', async () => {
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]);
    const balance = {
      provider: 'deepseek',
      isAvailable: true,
      currency: 'CNY',
      totalBalance: '8.25',
      balanceInfos: [{ currency: 'CNY', totalBalance: '8.25' }],
    };
    queryDeepSeekBalanceSpy.mockResolvedValue(balance);
    getDailyBalanceChangeSpy.mockResolvedValue({
      isAvailable: true,
      currency: 'CNY',
      change: '-1.75',
      direction: 'decrease',
    });
    const res = mockRes();

    await getDeepSeekBalance({ user: { id: 'root-id', role: 'root' }, body: { forceRefresh: true } }, res);

    expect(queryDeepSeekBalanceSpy).toHaveBeenCalledWith({ forceRefresh: true });
    expect(getDailyBalanceChangeSpy).toHaveBeenCalledWith(balance);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          totalBalance: '8.25',
          dailyBalanceChange: expect.objectContaining({ change: '-1.75', direction: 'decrease' }),
        }),
      }),
    );
  });
});

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

function mockAdminOverviewSnapshotStatement(sql) {
  const statement = String(sql);
  if (statement.includes('admin_overview_snapshot_resources')) {
    return [
      [
        { kind: 'user', total: 206, today: 1 },
        { kind: 'bookmark', total: 1069, today: 9 },
        { kind: 'note', total: 399, today: 7 },
        { kind: 'file', total: 195, today: 15, storageMb: 2120, trashMb: 862.58, trashCount: 82 },
      ],
    ];
  }
  if (statement.includes('FROM conversion_events')) return [[{ visitors: 10, registers: 2 }]];
  if (statement.includes('FROM opinion')) return [[{ pending: 3 }]];
  if (statement.includes('FROM security_events')) return [[{ unhandled: 4 }]];
  if (statement.includes('FROM todo_items') && !statement.includes('same_time_baseline')) {
    return [[{ total: 188, createdToday: 6, pending: 63, dueToday: 3, overdue: 17, completedToday: 9 }]];
  }
  if (statement.includes('AS activeToday')) {
    return [[{ activeToday: 19, active7d: 31, total: 4359, businessErrors: 46, invalidRequests: 0, serverErrors: 0 }]];
  }
  if (statement.includes('AS totalCount') && statement.includes('FROM ai_executions')) {
    return [[{ totalCount: 31, totalTokens: 39473, todayCount: 31, todayTokens: 39473 }]];
  }
  return null;
}

describe('getAdminOverviewSnapshot 首屏快照', () => {
  beforeEach(() => query.mockReset());

  it('只用一批七个查询返回核心指标，不等待趋势、同期或最近列表', async () => {
    query.mockImplementation(async (sql) => mockAdminOverviewSnapshotStatement(sql) || [[]]);
    const res = mockRes();

    await getAdminOverviewSnapshot({ user: { role: 'root' }, body: { hideInternal: true } }, res);

    expect(query).toHaveBeenCalledTimes(7);
    const resourceSql = String(
      query.mock.calls.find(([sql]) => String(sql).includes('admin_overview_snapshot_resources'))?.[0],
    );
    expect(resourceSql.match(/onboarding_seed_resources/g)).toHaveLength(3);
    expect(resourceSql).toContain('bookmark_owner.del_flag = 0');
    expect(resourceSql).toContain("role <> 'visitor'");
    expect(resourceSql).toContain("role NOT IN ('root', 'test')");

    const activitySql = String(query.mock.calls.find(([sql]) => String(sql).includes('AS activeToday'))?.[0]);
    expect(activitySql).toContain('COUNT(DISTINCT CASE');
    expect(activitySql).toContain('"routeMatched":true');
    expect(activitySql).toContain('api_log.request_time >= ?');
    expect(activitySql).not.toContain('user_sessions');

    const aiCalls = query.mock.calls.filter(([sql]) => String(sql).includes('FROM ai_executions'));
    expect(aiCalls).toHaveLength(1);
    expect(String(aiCalls[0][0])).toContain('AS totalCount');
    expect(String(aiCalls[0][0])).toContain('AS todayCount');
    expect(String(aiCalls[0][0])).toContain('model_called = 1');
    expect(String(aiCalls[0][0])).toContain('actor_user_id IS NULL OR');
    expect(String(aiCalls[0][0])).toContain('actor_user_id NOT IN');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('admin_overview_trend'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('same_time_baseline'))).toBe(false);

    const payload = res.send.mock.calls[0][0];
    expect(payload.status).toBe(200);
    expect(payload.data).toMatchObject({
      users: { total: 206, today: 1 },
      resources: { bookmarkTotal: 1069, noteTotal: 399, fileTotal: 195, trashCount: 82 },
      active: { today: 19, week: 31 },
      ai: { todayCount: 31, totalCount: 31 },
      pending: { opinion: 3, security: 4 },
    });
    expect(payload.data).not.toHaveProperty('trend');
    expect(payload.data).not.toHaveProperty('todayBaseline');
  });

  it('可选健康表失败时降级为零，不清空其余核心快照', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM security_events')) throw new Error('missing optional table');
      return mockAdminOverviewSnapshotStatement(sql) || [[]];
    });
    const res = mockRes();

    await getAdminOverviewSnapshot({ user: { role: 'root' }, body: { hideInternal: true } }, res);

    const payload = res.send.mock.calls[0][0];
    expect(payload.status).toBe(200);
    expect(payload.data.pending).toEqual({ opinion: 3, security: 0 });
    expect(payload.data.users.total).toBe(206);
  });

  it('非 root 用户无权读取且不查询数据库', async () => {
    const res = mockRes();
    await getAdminOverviewSnapshot({ user: { role: 'user' }, body: {} }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getAdminOverviewTrend 历史分析', () => {
  beforeEach(() => query.mockReset());

  it('用北京时间截至当前时刻计算昨日同期与前 7 日同期均值', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T17:40:30+08:00'));
    const baselineRows = [];
    for (let day = 5; day <= 11; day += 1) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      baselineRows.push(
        { d, kind: 'users', c: day === 11 ? 4 : 2 },
        { d, kind: 'bookmarks', c: day === 11 ? 4 : 3 },
        { d, kind: 'notes', c: 2 },
        { d, kind: 'files', c: 1 },
        { d, kind: 'todos', c: 5 },
        { d, kind: 'activeUsers', c: day === 11 ? 6 : 3 },
        { d, kind: 'aiCalls', c: day === 11 ? 8 : 4 },
      );
    }

    try {
      query.mockImplementation(async (sql) => {
        const statement = String(sql);
        if (statement.includes('same_time_baseline')) return [baselineRows];
        if (statement.includes('admin_overview_trend')) return [[]];
        if (statement.includes('AS activeUsers')) return [[{ activeUsers: 23 }]];
        return [[]];
      });
      const res = mockRes();

      await getAdminOverviewTrend({ user: { role: 'root' }, body: { days: 7, hideInternal: true } }, res);

      expect(query).toHaveBeenCalledTimes(3);
      const baselineCall = query.mock.calls.find(([sql]) => String(sql).includes('same_time_baseline'));
      expect(baselineCall?.[0]).toContain('TIME(create_time) <= ?');
      expect(baselineCall?.[0]).toContain('COUNT(DISTINCT api_log.user_id)');
      expect(baselineCall?.[0]).toContain('"routeMatched":true');
      expect(baselineCall?.[0]).toContain('onboarding_seed_resources');
      expect(baselineCall?.[1]).toEqual(
        Array.from({ length: 7 }, () => ['2026-08-05', '2026-08-12', '17:40:30']).flat(),
      );

      const payload = res.send.mock.calls[0][0].data;
      expect(payload.todayBaseline).toEqual({
        available: true,
        timezone: 'Asia/Shanghai',
        mode: 'same_elapsed_time',
        cutoffTime: '17:40',
        sampleDays: 7,
        metrics: {
          users: { yesterday: 4, average7d: 2.3 },
          resources: { yesterday: 7, average7d: 6.1 },
          bookmarks: { yesterday: 4, average7d: 3.1 },
          notes: { yesterday: 2, average7d: 2 },
          files: { yesterday: 1, average7d: 1 },
          todos: { yesterday: 5, average7d: 5 },
          activeUsers: { yesterday: 6, average7d: 3.4 },
          aiCalls: { yesterday: 8, average7d: 4.6 },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('90 天按周聚合，活跃用户使用有效业务 API 日志而不是会话表', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T12:00:00+08:00'));
    try {
      query.mockImplementation(async (sql) => {
        const statement = String(sql);
        if (statement.includes('same_time_baseline')) return [[]];
        if (statement.includes('admin_overview_trend')) {
          return [
            [
              { d: '2026-08-06', kind: 'user', c: 2 },
              { d: '2026-08-06', kind: 'note', c: 3 },
            ],
          ];
        }
        if (statement.includes('AS activeUsers')) return [[{ activeUsers: 23 }]];
        return [[]];
      });
      const res = mockRes();

      await getAdminOverviewTrend({ user: { role: 'root' }, body: { days: 90, hideInternal: true } }, res);

      const payload = res.send.mock.calls[0][0];
      const activeSql = String(query.mock.calls.find(([sql]) => String(sql).includes('AS activeUsers'))?.[0]);
      expect(payload.status).toBe(200);
      expect(activeSql).toContain('FROM api_logs api_log');
      expect(activeSql).toContain('"routeMatched":true');
      expect(activeSql).not.toContain('user_sessions');
      expect(payload.data).toMatchObject({ days: 90, granularity: 'week', activeUsers: 23 });
      expect(payload.data.trend).toHaveLength(13);
      expect(payload.data.trend.at(-1)).toMatchObject({ users: 2, notes: 3, contentTotal: 3 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('拒绝未定义的趋势周期', async () => {
    const res = mockRes();
    await getAdminOverviewTrend({ user: { role: 'root' }, body: { days: 365 } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getAdminOverview 兼容接口', () => {
  beforeEach(() => query.mockReset());

  it('并发组合快照与 7 日历史，并保留旧趋势字段', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00+08:00'));
    try {
      query.mockImplementation(async (sql) => {
        const snapshotResult = mockAdminOverviewSnapshotStatement(sql);
        if (snapshotResult) return snapshotResult;
        const statement = String(sql);
        if (statement.includes('same_time_baseline')) return [[]];
        if (statement.includes('admin_overview_trend')) {
          return [[{ d: '2026-08-24', kind: 'note', c: 3 }]];
        }
        if (statement.includes('AS activeUsers')) return [[{ activeUsers: 5 }]];
        return [[]];
      });
      const res = mockRes();

      await getAdminOverview({ user: { role: 'root' }, body: { hideInternal: true } }, res);

      expect(query).toHaveBeenCalledTimes(10);
      const payload = res.send.mock.calls[0][0];
      expect(payload.status).toBe(200);
      expect(payload.data.trend.at(-1)).toMatchObject({
        label: '08-24',
        d: '08-24',
        notes: 3,
        contentTotal: 3,
        content: 3,
      });
      expect(payload.data.trendPeriod).toEqual({ days: 7, granularity: 'day' });
      expect(payload.data).toHaveProperty('todayBaseline');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getAdminOverviewRecent 最近新增', () => {
  beforeEach(() => query.mockReset());

  it('按统一口径过滤示例资源和内部账号，并合并三类资源的最新 20 条', async () => {
    query
      // ensureRootRole 复核当前 root 身份
      .mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 'bookmark-1',
            title: '新书签',
            userId: 'user-1',
            userName: '小白',
            userRemark: '客户甲',
            createdAt: new Date('2026-08-07T08:00:00Z'),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 'note-1',
            title: '新笔记',
            userId: 'user-2',
            userName: '小青',
            createdAt: new Date('2026-08-07T10:00:00Z'),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 3,
            title: '新文件.pdf',
            userId: 'user-3',
            userName: '小橙',
            createdAt: new Date('2026-08-07T09:00:00Z'),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 'user-4',
            name: '新用户',
            userRemark: '内测用户',
            role: 'user',
            createdAt: new Date('2026-08-07T11:00:00Z'),
          },
        ],
      ]);
    const res = mockRes();

    await getAdminOverviewRecent({ user: { id: 'root-id', role: 'root' }, body: { hideInternal: true } }, res);

    const resourceSql = query.mock.calls.slice(1, 4).map(([sql]) => String(sql));
    expect(resourceSql.every((sql) => sql.includes('onboarding_seed_resources'))).toBe(true);
    expect(resourceSql.every((sql) => sql.includes('resource_owner.del_flag = 0'))).toBe(true);
    expect(resourceSql.every((sql) => sql.includes('LEFT JOIN admin_user_remarks'))).toBe(true);
    expect(resourceSql.every((sql) => sql.includes("COALESCE(owner_remark.remark_name, '') AS userRemark"))).toBe(true);
    expect(resourceSql.every((sql) => sql.includes("resource_owner.role NOT IN ('root', 'test')"))).toBe(true);
    expect(resourceSql.every((sql) => sql.includes('LIMIT ?'))).toBe(true);
    expect(query.mock.calls.slice(1, 5).every(([, params]) => params?.[0] === 'root-id')).toBe(true);
    expect(query.mock.calls.slice(1, 5).every(([, params]) => params?.at(-1) === 20)).toBe(true);
    expect(String(query.mock.calls[4][0])).toContain("role <> 'visitor'");
    expect(String(query.mock.calls[4][0])).toContain('LEFT JOIN admin_user_remarks');
    expect(String(query.mock.calls[4][0])).toContain('LIMIT ?');
    const payload = res.send.mock.calls[0][0];
    expect(payload.status).toBe(200);
    expect(payload.data.filter).toEqual({ period: 'recent', type: 'all', timezone: 'Asia/Shanghai' });
    expect(payload.data.limit).toBe(20);
    expect(payload.data.recentResources.map((item) => item.type)).toEqual(['note', 'file', 'bookmark']);
    expect(payload.data.recentResources[2]).toEqual(expect.objectContaining({ userRemark: '客户甲' }));
    expect(payload.data.recentUsers).toEqual([
      expect.objectContaining({ id: 'user-4', name: '新用户', userRemark: '内测用户', role: 'user' }),
    ]);
  });

  it('今日用户下钻只查询北京时间当天注册用户', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T08:30:00+08:00'));
    try {
      query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]).mockResolvedValueOnce([
        [
          {
            id: 'user-today',
            name: '今日用户',
            role: 'user',
            createdAt: new Date('2026-08-12T01:00:00Z'),
          },
        ],
      ]);
      const res = mockRes();

      await getAdminOverviewRecent(
        {
          user: { id: 'root-id', role: 'root' },
          body: { hideInternal: true, period: 'today', type: 'user' },
        },
        res,
      );

      expect(query).toHaveBeenCalledTimes(2);
      const [userSql, userParams] = query.mock.calls[1];
      expect(String(userSql)).toContain('recent_user.create_time >= ?');
      expect(String(userSql)).toContain('recent_user.create_time < DATE_ADD(?, INTERVAL 1 DAY)');
      expect(userParams).toEqual(['root-id', '2026-08-12', '2026-08-12', 20]);
      const payload = res.send.mock.calls[0][0];
      expect(payload.data.filter).toEqual({ period: 'today', type: 'user', timezone: 'Asia/Shanghai' });
      expect(payload.data.recentResources).toEqual([]);
      expect(payload.data.recentUsers).toEqual([expect.objectContaining({ id: 'user-today' })]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('指定资源类型时不重复查询其他资源表或用户表', async () => {
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]).mockResolvedValueOnce([
      [
        {
          id: 'note-only',
          title: '指定笔记',
          userId: 'user-1',
          userName: '小青',
          createdAt: new Date('2026-08-12T02:00:00Z'),
        },
      ],
    ]);
    const res = mockRes();

    await getAdminOverviewRecent(
      {
        user: { id: 'root-id', role: 'root' },
        body: { period: 'today', type: 'note' },
      },
      res,
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toContain('FROM note');
    const payload = res.send.mock.calls[0][0];
    expect(payload.data.recentResources).toEqual([expect.objectContaining({ id: 'note-only', type: 'note' })]);
    expect(payload.data.recentUsers).toEqual([]);
  });

  it('资源流使用稳定复合游标分页，并且不查询用户表', async () => {
    const sameTime = new Date('2026-08-12T04:00:00Z');
    query
      .mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([
        [
          { id: 'bookmark-b', title: '书签 B', userId: 'u1', userName: '甲', createdAt: sameTime },
          { id: 'bookmark-a', title: '书签 A', userId: 'u1', userName: '甲', createdAt: sameTime },
          {
            id: 'bookmark-old',
            title: '旧书签',
            userId: 'u1',
            userName: '甲',
            createdAt: new Date('2026-08-12T03:00:00Z'),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 'note-1',
            title: '同刻笔记',
            userId: 'u2',
            userName: '乙',
            createdAt: sameTime,
          },
        ],
      ])
      .mockResolvedValueOnce([[]]);
    const firstRes = mockRes();

    await getAdminOverviewRecent(
      {
        user: { id: 'root-id', role: 'root' },
        body: { period: 'today', type: 'all', target: 'resource', cursor: null, limit: 2 },
      },
      firstRes,
    );

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls.slice(1).every(([, params]) => params?.at(-1) === 3)).toBe(true);
    const firstPage = firstRes.send.mock.calls[0][0].data;
    expect(firstPage.items.map((item) => `${item.type}:${item.id}`)).toEqual([
      'bookmark:bookmark-b',
      'bookmark:bookmark-a',
    ]);
    expect(firstPage).toEqual(
      expect.objectContaining({ target: 'resource', limit: 2, hasMore: true, nextCursor: expect.any(String) }),
    );

    query.mockReset();
    query
      .mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 'bookmark-old',
            title: '旧书签',
            userId: 'u1',
            userName: '甲',
            createdAt: new Date('2026-08-12T03:00:00Z'),
          },
        ],
      ])
      .mockResolvedValueOnce([[{ id: 'note-1', title: '同刻笔记', userId: 'u2', userName: '乙', createdAt: sameTime }]])
      .mockResolvedValueOnce([[]]);
    const secondRes = mockRes();

    await getAdminOverviewRecent(
      {
        user: { id: 'root-id', role: 'root' },
        body: {
          period: 'today',
          type: 'all',
          target: 'resource',
          cursor: firstPage.nextCursor,
          limit: 2,
        },
      },
      secondRes,
    );

    expect(String(query.mock.calls[1][0])).toContain('bookmark.id < ?');
    expect(String(query.mock.calls[2][0])).toContain('note.create_time <= ?');
    expect(secondRes.send.mock.calls[0][0].data.items.map((item) => `${item.type}:${item.id}`)).toEqual([
      'note:note-1',
      'bookmark:bookmark-old',
    ]);
  });

  it('文件流同一时间按数字主键倒序，保持 SQL 与合并游标排序一致', async () => {
    const sameTime = new Date('2026-08-12T04:00:00Z');
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]).mockResolvedValueOnce([
      [
        { id: 10, title: '文件 10', userId: 'u1', userName: '甲', createdAt: sameTime },
        { id: 9, title: '文件 9', userId: 'u1', userName: '甲', createdAt: sameTime },
      ],
    ]);
    const res = mockRes();

    await getAdminOverviewRecent(
      {
        user: { id: 'root-id', role: 'root' },
        body: { period: 'today', type: 'file', target: 'resource', cursor: null, limit: 1 },
      },
      res,
    );

    const page = res.send.mock.calls[0][0].data;
    expect(page.items.map((item) => item.id)).toEqual([10]);
    expect(page).toEqual(expect.objectContaining({ hasMore: true, nextCursor: expect.any(String) }));
  });

  it('用户流独立游标分页，并拒绝跨筛选复用游标', async () => {
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]).mockResolvedValueOnce([
      [
        { id: 'user-3', name: '用户 3', role: 'user', createdAt: new Date('2026-08-12T03:00:00Z') },
        { id: 'user-2', name: '用户 2', role: 'user', createdAt: new Date('2026-08-12T02:00:00Z') },
      ],
    ]);
    const firstRes = mockRes();

    await getAdminOverviewRecent(
      {
        user: { id: 'root-id', role: 'root' },
        body: { period: 'recent', type: 'user', target: 'user', cursor: null, limit: 1 },
      },
      firstRes,
    );

    expect(query).toHaveBeenCalledTimes(2);
    const firstPage = firstRes.send.mock.calls[0][0].data;
    expect(firstPage.items).toEqual([expect.objectContaining({ id: 'user-3' })]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    query.mockReset();
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]);
    const invalidRes = mockRes();
    await getAdminOverviewRecent(
      {
        user: { id: 'root-id', role: 'root' },
        body: {
          period: 'today',
          type: 'user',
          target: 'user',
          cursor: firstPage.nextCursor,
          limit: 1,
        },
      },
      invalidRes,
    );

    expect(invalidRes.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('拒绝未知筛选值，避免把无效条件静默当成全部数据', async () => {
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]);
    const res = mockRes();

    await getAdminOverviewRecent(
      {
        user: { id: 'root-id', role: 'root' },
        body: { period: 'today', type: 'todo' },
      },
      res,
    );

    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('非 root 用户无权读取且不执行资源查询', async () => {
    const res = mockRes();

    await getAdminOverviewRecent({ user: { id: 'user-1', role: 'user' }, body: {} }, res);

    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getAgentLogs 请求摘要', () => {
  beforeEach(() => query.mockReset());

  it('保留短提问、识别旧隐私占位符，并截断过长文本', async () => {
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('SELECT a.*')) {
        return [
          [
            {
              id: '3',
              task_type: 'agent',
              question: '帮我总结这篇笔记',
              turn_contract_trace: JSON.stringify({
                version: '2.0-shadow',
                requestedScopeMode: 'explicit',
                allowedSourceCount: 3,
              }),
              created_at: '2026-08-06 12:03:00',
            },
            {
              id: '2',
              task_type: 'note_assist',
              question: '[笔记助手请求，正文不写入日志]',
              created_at: '2026-08-06 12:02:00',
            },
            { id: '1', task_type: 'agent', question: 'a'.repeat(620), created_at: '2026-08-06 12:01:00' },
            {
              id: '0',
              task_type: 'agent_confirmation',
              question: '[Agent 请求，用户未提交问题]',
              created_at: '2026-08-06 12:00:00',
            },
          ],
        ];
      }
      if (statement.includes('COUNT(*) as total')) return [[{ total: 4 }]];
      return [[]];
    });
    const res = mockRes();

    await getAgentLogs({ user: { role: 'root' }, body: { hideInternal: false, currentPage: 1, pageSize: 20 } }, res);

    const items = res.send.mock.calls[0][0].data.items;
    expect(items[0]).toMatchObject({
      requestPreview: '帮我总结这篇笔记',
      requestKind: 'user_question',
      requestLabel: '提问',
      turnContractTrace: {
        version: '2.0-shadow',
        requestedScopeMode: 'explicit',
        allowedSourceCount: 3,
      },
    });
    expect(items[0]).not.toHaveProperty('turn_contract_trace');
    expect(items[1]).toMatchObject({ requestPreview: '笔记助手（请求正文未记录）', requestKind: 'redacted' });
    expect(items[2].requestTruncated).toBe(true);
    expect(items[2].requestPreview).toHaveLength(501);
    expect(items[2].question).toBe(items[2].requestPreview);
    expect(items[3]).toMatchObject({
      taskTypeLabel: '操作确认',
      requestPreview: '操作确认（用户未提交问题）',
    });
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
    unlinkSpy.mockReset();
    unlinkSpy.mockResolvedValue();
    processBookmarkIcons.mockResolvedValue([]);
  });

  it('普通游客浏览时静默跳过图标写入', async () => {
    const res = mockRes();
    await analyzeImgUrl(
      { user: { id: 'visitor-1', role: 'visitor' }, body: [{ id: 'bookmark-1', noCache: true }] },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200, data: [] }));
    expect(query).not.toHaveBeenCalled();
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
    expect(query).not.toHaveBeenCalled();
  });

  it('登录用户只按自己的 user_id 查询待更新书签，且不信任客户端 URL', async () => {
    query.mockResolvedValue([[]]);
    const res = mockRes();
    await analyzeImgUrl(
      {
        user: { id: 'user-1', role: 'user' },
        body: [{ id: 'bookmark-1', url: 'http://attacker.invalid', noCache: true }],
      },
      res,
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('WHERE user_id = ?');
    expect(query.mock.calls[0][1]).toEqual(['user-1', 'bookmark-1']);
  });

  it('保存后一小时内复用最近检查结果，不重复抓取或写文件', async () => {
    const checkedAt = new Date();
    query.mockResolvedValueOnce([
      [
        {
          id: 'bookmark-1',
          url: 'https://example.com',
          icon_url: '/uploads/bookmark-1.png',
          icon_checked_at: checkedAt,
        },
      ],
    ]);
    const res = mockRes();

    await analyzeImgUrl(
      {
        user: { id: 'user-1', role: 'user' },
        body: [{ id: 'bookmark-1', refreshMode: 'after_save' }],
      },
      res,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: [expect.objectContaining({ id: 'bookmark-1', changed: false, throttled: true })],
      }),
    );
    expect(processBookmarkIcons).not.toHaveBeenCalled();
  });

  it('非节流书签会调用 processBookmarkIcons', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 'icon-id-1',
          url: 'https://example.com',
          icon_url: '',
          icon_checked_at: new Date('2026-06-01T00:00:00Z'),
        },
      ],
    ]);
    processBookmarkIcons.mockResolvedValueOnce([
      {
        id: 'icon-id-1',
        iconUrl: '',
        iconCheckedAt: new Date().toISOString(),
        changed: false,
      },
    ]);
    const res = mockRes();

    await analyzeImgUrl(
      {
        user: { id: 'user-1', role: 'user' },
        body: [{ id: 'icon-id-1', refreshMode: 'periodic' }],
      },
      res,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(processBookmarkIcons).toHaveBeenCalledOnce();
    expect(processBookmarkIcons.mock.calls[0][0]).toHaveLength(1);
    expect(processBookmarkIcons.mock.calls[0][1]).toBe('user-1');
    expect(res.send).toHaveBeenCalled();
  });
});

describe('书签图标内容判断', () => {
  it('保存后刷新仅在一小时冷却期外再次执行', () => {
    const now = Date.parse('2026-07-19T12:00:00Z');
    expect(isBookmarkIconCheckRecent('2026-07-19T11:00:01Z', now)).toBe(true);
    expect(isBookmarkIconCheckRecent('2026-07-19T11:00:00Z', now)).toBe(false);
    expect(isBookmarkIconCheckRecent(null, now)).toBe(false);
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

  it('主漏斗展示独立事件总人数，同时返回严格时序路径用于诊断', async () => {
    query.mockImplementation((sql) => {
      const statement = String(sql);
      if (statement.includes('COUNT(DISTINCT p.fingerprint) AS pageView')) {
        return [[{ pageView: 100, signupOpen: 40, signupSubmit: 25, registerSuccess: 20 }]];
      }
      if (statement.includes('GROUP BY event')) {
        return [
          [
            { event: 'page_view', visitors: 100 },
            { event: 'signup_open', visitors: 45 },
            { event: 'signup_submit', visitors: 30 },
            { event: 'register', visitors: 24 },
          ],
        ];
      }
      return [[]];
    });
    const res = mockRes();

    await getConversionFunnel({ user: { role: 'root' }, body: {} }, res);

    expect(res.send.mock.calls[0][0].data.mainFunnel).toEqual([
      { key: 'pageView', label: '访问', count: 100, fromPreviousRate: null, lost: null },
      { key: 'signupOpen', label: '打开注册', count: 45, fromPreviousRate: 45, lost: 55 },
      { key: 'signupSubmit', label: '提交注册', count: 30, fromPreviousRate: 66.7, lost: 15 },
      { key: 'registerSuccess', label: '注册成功', count: 24, fromPreviousRate: 80, lost: 6 },
    ]);
    expect(res.send.mock.calls[0][0].data.orderedFunnel).toEqual([
      { key: 'pageView', label: '访问', count: 100, fromPreviousRate: null, lost: null },
      { key: 'signupOpen', label: '打开注册', count: 40, fromPreviousRate: 40, lost: 60 },
      { key: 'signupSubmit', label: '提交注册', count: 25, fromPreviousRate: 62.5, lost: 15 },
      { key: 'registerSuccess', label: '注册成功', count: 20, fromPreviousRate: 80, lost: 5 },
    ]);
    const orderedSql = query.mock.calls.find(([sql]) => String(sql).includes('COUNT(DISTINCT p.fingerprint)'))[0];
    expect(orderedSql).toContain('s.create_time > p.create_time');
    expect(orderedSql).toContain('submit_event.create_time > s.create_time');
    expect(orderedSql).toContain('register_event.create_time > submit_event.create_time');
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

  /**
   * 进入示例和打开注册是并行入口:signup_open 的访客不是 demo_enter 的子集。
   * 所以要按 fingerprint 拆出「先看过示例」和「没看示例」两路,页面才不会拿两批
   * 不相干的人相除。两路互斥且相加等于该事件总访客数。
   */
  it('按 fingerprint 拆分示例路径与直接路径,两路相加等于总访客数', async () => {
    const calls = [];
    query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      if (/GROUP BY event/.test(sql)) {
        return Promise.resolve([
          [
            { event: 'page_view', visitors: 10 },
            { event: 'demo_enter', visitors: 8 },
            { event: 'wall_hit', visitors: 6 },
            { event: 'signup_open', visitors: 4 },
            { event: 'register', visitors: 2 },
          ],
        ]);
      }
      if (/GROUP BY fingerprint/.test(sql)) {
        return Promise.resolve([
          [
            {
              demoThenSignupOpen: 3,
              directSignupOpen: 1,
              demoThenRegister: 1,
              directRegister: 1,
              wallThenSignupOpen: 2,
            },
          ],
        ]);
      }
      if (/DISTINCT ip/.test(sql)) return Promise.resolve([[{ ips: 4 }]]);
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await getConversionFunnel(
      { user: { role: 'root' }, body: { startDate: '2026-07-01', endDate: '2026-07-31' } },
      res,
    );
    const arg = res.send.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      demoThenSignupOpenVisitors: 3,
      directSignupOpenVisitors: 1,
      demoThenRegisterVisitors: 1,
      directRegisterVisitors: 1,
      wallThenSignupOpenVisitors: 2,
    });
    // 拆分口径的自洽性:两路相加必须等于主查询的总访客数,否则页面上的验算会对不上
    expect(arg.data.demoThenSignupOpenVisitors + arg.data.directSignupOpenVisitors).toBe(arg.data.signupOpenVisitors);
    expect(arg.data.demoThenRegisterVisitors + arg.data.directRegisterVisitors).toBe(arg.data.registerVisitors);
    const pathCall = calls.find((c) => /GROUP BY fingerprint/.test(c.sql));
    // 归属靠首次事件时间比较(示例发生在注册意图之前),而不是简单的集合相交
    expect(pathCall.sql).toContain('demo_first < signup_first');
    expect(pathCall.sql).toContain("MIN(CASE WHEN event = 'demo_enter' THEN create_time END)");
    expect(pathCall.sql).toContain("fingerprint <> ''");
    // 时间窗同样下推,否则路径拆分会用全期数据、和上面各段的时间窗对不上
    expect(pathCall.params).toEqual(['2026-07-01 00:00:00', '2026-07-31']);
  });

  it('路径拆分查询无结果时各路径字段归零,不影响其余字段', async () => {
    query.mockImplementation((sql) => {
      if (/GROUP BY event/.test(sql)) return Promise.resolve([[{ event: 'page_view', visitors: 5 }]]);
      if (/GROUP BY fingerprint/.test(sql)) return Promise.resolve([[]]);
      if (/DISTINCT ip/.test(sql)) return Promise.resolve([[{ ips: 3 }]]);
      return Promise.resolve([[]]);
    });
    const res = mockRes();
    await getConversionFunnel({ user: { role: 'root' } }, res);
    const arg = res.send.mock.calls[0][0];
    expect(arg.status).toBe(200);
    expect(arg.data).toMatchObject({
      pageViewVisitors: 5,
      demoThenSignupOpenVisitors: 0,
      directSignupOpenVisitors: 0,
      demoThenRegisterVisitors: 0,
      directRegisterVisitors: 0,
      wallThenSignupOpenVisitors: 0,
      uniqueIps: 3,
    });
  });
});

describe('clearLogsByIp 按 IP 清理(破坏性边界)', () => {
  beforeEach(() => {
    query.mockReset();
    getConnection.mockReset();
  });

  function cleanupConnection(affectedRows) {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (/DELETE FROM/.test(String(sql))) return [{ affectedRows }];
        return [{ affectedRows: 1 }];
      }),
    };
    getConnection.mockResolvedValue(connection);
    return connection;
  }

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
    query.mockResolvedValue([{ affectedRows: 1 }]);
    const connection = cleanupConnection(2);
    const res = mockRes();
    await clearLogsByIp(
      {
        user: { id: 'r', role: 'root' },
        requestId: 'cleanup-local',
        body: {
          mode: 'local',
          reason: '清理本地联调噪声',
          confirmed: true,
          confirmText: '确认清理日志',
        },
      },
      res,
    );
    const deletes = connection.query.mock.calls.filter((c) => /DELETE FROM/.test(c[0]));
    expect(deletes).toHaveLength(3);
    deletes.forEach((c) => {
      expect(c[0]).toContain("LOWER(ip)='::1'");
      expect(c[1]).toEqual([]);
    });
    const arg = res.send.mock.calls[0][0];
    expect(arg.status).toBe(200);
    expect(arg.data).toMatchObject({ apiLogs: 2, conversionEvents: 2, operationLogs: 2 });
    expect(arg.data.auditId).toBeTruthy();
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('root + exact 模式 → 三表 DELETE 均以 ip=? 参数化绑定该 IP', async () => {
    query.mockResolvedValue([{ affectedRows: 1 }]);
    const connection = cleanupConnection(1);
    const res = mockRes();
    await clearLogsByIp(
      {
        user: { id: 'r', role: 'root' },
        body: {
          ip: '1.2.3.4',
          reason: '清理指定测试设备',
          confirmed: true,
          confirmText: '确认清理日志',
        },
      },
      res,
    );
    const deletes = connection.query.mock.calls.filter((c) => /DELETE FROM/.test(c[0]));
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
    expect(payload.data.today).toEqual({ count: 3, tokens: 120 });
    expect(payload.data.total).toEqual({ count: 10, tokens: 500 });
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

describe('getAiFeedback AI 回答反馈看板', () => {
  beforeEach(() => query.mockReset());

  it('非 root 无法读取反馈正文', async () => {
    const res = mockRes();
    await getAiFeedback({ user: { role: 'user' }, body: {} }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('只读取仍保留且未删除会话中的反馈，并返回列表、汇总和原因分布', async () => {
    query.mockImplementation((sql) => {
      const statement = String(sql);
      if (statement.includes('GROUP BY f.reason')) return Promise.resolve([[{ reason: 'incorrect', count: 1 }]]);
      if (statement.includes('SUM(f.rating')) {
        return Promise.resolve([[{ total: 1, helpful: 0, unhelpful: 1, pending: 1 }]]);
      }
      if (statement.includes('COUNT(*) AS total')) return Promise.resolve([[{ total: 1 }]]);
      return Promise.resolve([
        [
          {
            id: 'feedback-1',
            conversation_id: 'conversation-1',
            message_id: 'message-1',
            request_id: 'request-1',
            rating: 'unhelpful',
            reason: 'incorrect',
            resolved: 0,
            comment: '答案有误',
            user_alias: '测试用户',
            conversation_title: '测试会话',
            question: '问题',
            answer: '回答',
            model_meta_json: null,
            create_time: '2026-07-23 12:00:00',
            update_time: '2026-07-23 12:00:00',
          },
        ],
      ]);
    });
    const res = mockRes();
    await getAiFeedback(
      { user: { role: 'root' }, body: { rating: 'unhelpful', resolved: 'pending', keyword: '答案' } },
      res,
    );
    const payload = res.send.mock.calls[0][0];
    expect(payload.status).toBe(200);
    expect(payload.data.summary).toMatchObject({ total: 1, helpful: 0, unhelpful: 1, pending: 1 });
    expect(payload.data.items[0]).toMatchObject({
      rating: 'unhelpful',
      question: '问题',
      answer: '回答',
      triageStatus: 'open',
      triagePriority: 'normal',
    });
    expect(payload.data.reasons).toEqual([{ reason: 'incorrect', count: 1 }]);
    const statements = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(statements).toContain("c.status IN ('active', 'archived')");
    expect(statements).toContain("retention_mode <> 'temporary'");
    expect(statements).toContain('q.id = m.parent_message_id');
    expect(statements).toContain('LEFT JOIN admin_ai_feedback_triage');
    expect(statements).not.toContain('q.request_id = f.request_id');
  });
});

describe('后台日志组合筛选', () => {
  beforeEach(() => query.mockReset());

  it('API 日志按请求 ID、方法、状态、日期和耗时参数化筛选', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
    const res = mockRes();
    await getApiLogs(
      {
        user: { role: 'root' },
        body: {
          cursor: null,
          limit: 20,
          filters: {
            key: '/api/chat',
            requestId: 'request-12345678',
            method: 'POST',
            status: '5xx',
            minDurationMs: 900,
            startDate: '2026-08-01',
            endDate: '2026-08-09',
            hideInternal: false,
          },
        },
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('a.request_id = ?');
    expect(String(sql)).toContain('a.method = ?');
    expect(String(sql)).toContain('a.duration_ms >= ?');
    expect(String(sql)).toContain("a.status_code BETWEEN '500' AND '599'");
    expect(String(sql)).not.toContain('CAST(a.status_code');
    expect(String(sql)).not.toContain('request-12345678');
    expect(params).toEqual(expect.arrayContaining(['request-12345678', 'POST', 900, '2026-08-01 00:00:00']));
  });

  it('API 日志首屏不执行空关键词模糊匹配，也不读取长请求体', async () => {
    query
      .mockResolvedValueOnce([
        [
          {
            id: 'api-log-1',
            user_id: 'user-1',
            url: '/api/file/preview/resolve',
            method: 'POST',
            system: '{"os":"Windows 10"}',
            request_time: '2026-08-12 10:35:31',
            status_code: '200',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const res = mockRes();

    await getApiLogs(
      { user: { role: 'root' }, body: { cursor: null, limit: 20, filters: { hideInternal: false } } },
      res,
    );

    const [listSql] = query.mock.calls[0];
    expect(String(listSql)).not.toContain('LIKE CONCAT');
    expect(String(listSql)).not.toContain('a.*');
    expect(String(listSql)).not.toMatch(/\ba\.req\b/);
    expect(String(listSql)).toContain("a.del_flag = '0'");
    expect(String(listSql)).not.toContain('a.del_flag = 0');
    const payload = res.send.mock.calls[0][0];
    expect(payload.data.total).toBe(1);
    expect(payload.data.items[0]).not.toHaveProperty('req');
  });

  it('API 日志默认隐藏内部账号时用索引计数相减，并保持精确总数口径', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 100 }]]);
    const res = mockRes();

    await getApiLogs(
      { user: { role: 'root' }, body: { cursor: null, limit: 20, filters: { hideInternal: true } } },
      res,
    );

    const [listSql, listParams] = query.mock.calls[0];
    const [countSql, countParams] = query.mock.calls[1];
    expect(String(listSql)).toContain('a.user_id NOT IN (SELECT internal_user.id');
    expect(listParams).toEqual(expect.arrayContaining(['root', 'test']));
    expect(String(countSql)).toContain('FORCE INDEX (idx_api_logs_admin_list)');
    expect(String(countSql)).toContain('FORCE INDEX (idx_api_logs_user_time)');
    expect(String(countSql)).toContain('INNER JOIN user internal_user');
    expect(countParams).toEqual(['root', 'test']);
    expect(res.send.mock.calls[0][0].data.total).toBe(100);
  });

  it('API 日志请求体只在打开单条详情后按 ID 读取', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 'api-log-1',
          user_id: 'user-1',
          url: '/api/file/preview/resolve',
          method: 'POST',
          req: '{"fileId":88}',
          system: '{"os":"Windows 10","runtime":"browser"}',
          request_time: '2026-08-12 10:35:31',
          status_code: '200',
        },
      ],
    ]);
    const res = mockRes();

    await getApiLogDetail({ user: { role: 'root' }, body: { id: 'api-log-1' } }, res);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('a.req');
    expect(String(sql)).toContain("WHERE a.id = ? AND a.del_flag = '0'");
    expect(params).toEqual(['api-log-1']);
    expect(res.send.mock.calls[0][0]).toMatchObject({
      status: 200,
      data: { id: 'api-log-1', req: { fileId: 88 }, system: { os: 'Windows 10', runtime: 'browser' } },
    });
  });

  it('操作日志支持用户、模块与日期精确下钻', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
    const res = mockRes();
    await getOperationLogs(
      {
        user: { role: 'root' },
        body: {
          cursor: null,
          limit: 20,
          filters: {
            key: '保存',
            module: '笔记库',
            userId: 'user-1',
            startDate: '2026-08-01',
            endDate: '2026-08-09',
            hideInternal: false,
          },
        },
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('o.module = ?');
    expect(String(sql)).toContain('o.create_by = ?');
    expect(String(sql)).not.toContain('user-1');
    expect(params).toEqual(expect.arrayContaining(['笔记库', 'user-1', '2026-08-09 23:59:59']));
  });
});

describe('clearImages 服务端校验与失败上报', () => {
  const rootReq = (images) => ({ user: { id: 'root-1', role: 'root' }, body: { images } });
  beforeEach(() => {
    query.mockReset();
    unlinkSpy.mockReset();
    collectUsedSpy.mockReset();
    deleteThumbnailSpy.mockReset();
    // ensureRootRole 的复核查询
    query.mockResolvedValue([[{ role: 'root', del_flag: 0 }]]);
    collectUsedSpy.mockResolvedValue(new Set());
    deleteThumbnailSpy.mockResolvedValue(false);
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

  it('派生缩略图清理失败时仍继续删除原图', async () => {
    deleteThumbnailSpy.mockRejectedValueOnce(Object.assign(new Error('cache readonly'), { code: 'EACCES' }));
    const res = mockRes();
    await clearImages(rootReq([{ fullFileName: 'a.png' }]), res);
    expect(unlinkSpy).toHaveBeenCalledWith('/www/wwwroot/images/a.png');
    expect(res.send.mock.calls.at(-1)[0].data.deleted).toEqual(['a.png']);
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

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query } }));

const { getAdminProductInsights, getAdminGovernance, adminInsightsHandleInternals } =
  await import('./adminInsightsHandle.js');

function response() {
  return {
    body: null,
    send(payload) {
      this.body = payload;
      return payload;
    },
  };
}

function resultFor(sql) {
  const statement = String(sql);
  if (statement.includes('FROM api_logs l') && !statement.includes('AS cohort_start')) return [[{ users: 20 }]];
  if (statement.includes('COUNT(*) AS users') && statement.includes('FROM user')) return [[{ users: 8 }]];
  if (statement.includes('activated_users')) return [[{ new_users: 8, activated_users: 4 }]];
  if (statement.includes('AS cohort_start')) {
    return [
      [
        {
          cohort_start: '2026-08-03',
          registered: 5,
          d1_eligible: 4,
          d1_retained: 2,
          d7_eligible: 0,
          d7_retained: 0,
          d30_eligible: 0,
          d30_retained: 0,
        },
      ],
    ];
  }
  if (statement.includes('FROM bookmark b')) return [[{ users: 10, events: 35 }]];
  if (statement.includes('FROM note n')) return [[{ users: 8, events: 42 }]];
  if (statement.includes('FROM files f')) return [[{ users: 4, events: 7 }]];
  if (statement.includes('FROM todo_items t')) return [[{ users: 6, events: 19 }]];
  if (statement.includes('FROM ai_product_events e')) return [[{ users: 5, events: 28 }]];
  if (statement.includes('FROM community_chat_messages m')) {
    throw Object.assign(new Error('not migrated'), { code: 'ER_NO_SUCH_TABLE' });
  }
  throw new Error(`unexpected query: ${statement}`);
}

describe('后台产品洞察与治理快照', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql) => resultFor(sql));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('非 Root 与管理员预览上下文均不可读取聚合运营数据', async () => {
    const userRes = response();
    await getAdminProductInsights({ user: { role: 'user' }, body: {} }, userRes);
    expect(userRes.body).toMatchObject({ status: 403 });

    const previewRes = response();
    await getAdminProductInsights({ user: { role: 'root' }, adminContext: { id: 'ctx-1' }, body: {} }, previewRes);
    expect(previewRes.body).toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });

  it('返回匿名聚合的采用率与留存，单个新模块缺失时降级但不拖垮页面', async () => {
    const res = response();
    await getAdminProductInsights({ user: { role: 'root' }, body: { periodDays: 30 } }, res);

    expect(res.body).toMatchObject({
      status: 200,
      data: {
        summary: {
          activeUsers: 20,
          newUsers: 8,
          activatedUsers: 4,
          activationRate: 50,
          aiAdoptionRate: 25,
        },
        unavailableSources: ['community'],
        privacy: { aggregateOnly: true, excludesInternalRoles: true, contentStored: false },
        cohorts: [{ cohortStart: '2026-08-03', d1: { eligible: 4, retained: 2, rate: 50 } }],
      },
    });
    const community = res.body.data.features.find((item) => item.source === 'community');
    expect(community).toMatchObject({ available: false, users: 0, events: 0, rate: 0 });
    expect(JSON.stringify(res.body)).not.toContain('user_id');
  });

  it('没有成熟激活样本时返回未知，不回退到全部新用户作为分母', async () => {
    query.mockImplementation(async (sql) =>
      String(sql).includes('activated_users') ? [[{ new_users: 0, activated_users: 0 }]] : resultFor(sql),
    );
    const res = response();
    await getAdminProductInsights({ user: { role: 'root' }, body: {} }, res);
    expect(res.body.data.summary).toMatchObject({ newUsers: 8, activationEligible: 0, activationRate: null });
  });

  it('激活数据源不可用时不把缺失伪装成零转化率', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('activated_users')) throw new Error('unavailable');
      return resultFor(sql);
    });
    const res = response();
    await getAdminProductInsights({ user: { role: 'root' }, body: {} }, res);
    expect(res.body.data.summary.activationRate).toBeNull();
    expect(res.body.data.unavailableSources).toContain('activation');
  });

  it('资源与待办采用统计排除注册种子，但保留种子待办的真实完成行为', async () => {
    const res = response();
    await getAdminProductInsights({ user: { role: 'root' }, body: { periodDays: 30 } }, res);

    const sqlStatements = query.mock.calls.map(([sql]) => String(sql));
    const resourceQueries = [
      { table: 'FROM bookmark b', owner: 'b.user_id', type: 'bookmark', resource: 'b.id' },
      { table: 'FROM note n', owner: 'n.create_by', type: 'note', resource: 'n.id' },
      { table: 'FROM files f', owner: 'f.create_by', type: 'file', resource: 'CAST(f.id AS CHAR)' },
    ];

    for (const expected of resourceQueries) {
      const sql = sqlStatements.find((statement) => statement.includes(expected.table));
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('FROM onboarding_seed_resources osr');
      expect(sql).toContain(`osr.user_id = ${expected.owner}`);
      expect(sql).toContain(`osr.resource_type = '${expected.type}'`);
      expect(sql).toContain(`osr.resource_id = ${expected.resource}`);
    }
    const todoSql = sqlStatements.find((statement) => statement.includes('FROM todo_items t'));
    expect(todoSql).toContain("osr.resource_type = 'todo'");
    expect(todoSql).toContain('osr.resource_id = t.id');
    expect(todoSql).toContain("t.status = 'completed'");
    expect(todoSql).toContain('t.completed_at >= DATE_SUB');
  });

  it('周期只接受明确档位，百分比在空分母时稳定为 0', () => {
    expect(adminInsightsHandleInternals.normalizePeriodDays(31)).toBe(7);
    expect(adminInsightsHandleInternals.normalizePeriodDays(90)).toBe(90);
    expect(adminInsightsHandleInternals.percent(3, 0)).toBe(0);
    expect(adminInsightsHandleInternals.percent(1, 3)).toBe(33.3);
  });

  it('默认七天并对各聚合设置执行上限', async () => {
    await getAdminProductInsights({ user: { role: 'root' }, body: {} }, response());
    const calls = query.mock.calls;
    expect(calls).toHaveLength(10);
    expect(calls[0][1]).toEqual([7]);
    expect(calls.every(([sql]) => sql.startsWith('SELECT /*+ MAX_EXECUTION_TIME(5000) */'))).toBe(true);
  });

  it('治理接口只返回显式白名单策略，不枚举密钥或开启任意配置写入', async () => {
    vi.stubEnv('ADMIN_MAINTENANCE_ENABLED', 'true');
    vi.stubEnv('AI_PRODUCT_EVENT_RETENTION_DAYS', 'invalid');
    vi.stubEnv('SHOULD_NEVER_LEAK_SECRET', 'private-value');
    const res = response();
    await getAdminGovernance({ user: { role: 'root' } }, res);

    expect(res.body).toMatchObject({
      status: 200,
      data: {
        safety: {
          readOnlySnapshot: true,
          secretsExposed: false,
          arbitraryConfigWriteEnabled: false,
        },
        runtime: {
          adminContext: { maintenanceEnabled: true },
          retention: { aiProductEvents: { retentionDays: 180, state: 'invalid' } },
        },
      },
    });
    expect(res.body.data.routePolicies.total).toBeGreaterThan(50);
    expect(res.body.data.roles.find((item) => item.role === 'root')).toMatchObject({
      adminConsole: true,
      contentMaintenance: true,
    });
    expect(res.body.data.warnings.map((item) => item.code)).toContain('ai_product_retention_invalid');
    expect(JSON.stringify(res.body)).not.toContain('private-value');
    expect(query).not.toHaveBeenCalled();
  });
});

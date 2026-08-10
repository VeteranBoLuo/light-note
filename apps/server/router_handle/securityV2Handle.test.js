import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
  };
  return {
    connection,
    pool: { getConnection: vi.fn(() => Promise.resolve(connection)), query: vi.fn() },
    applySecurityEventHandle: vi.fn(),
  };
});

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/security/services/securityEventHandling.js', () => ({
  applySecurityEventHandle: mocks.applySecurityEventHandle,
}));

const { batchSetSecurityReviewDisposition, getSecurityOverviewV2, getSecurityReviewClusters, getSecurityRuleQuality } =
  await import('./securityV2Handle.js');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status: vi.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    send: vi.fn(function send(body) {
      this.body = body;
      return this;
    }),
  };
}

describe('securityV2Handle 批量事件复核', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.query.mockReset();
    mocks.connection.query.mockReset();
    mocks.connection.beginTransaction.mockResolvedValue();
    mocks.connection.commit.mockResolvedValue();
    mocks.connection.rollback.mockResolvedValue();
    mocks.applySecurityEventHandle.mockResolvedValue();
  });

  it('在同一事务中处理所选事件簇内的全部事件', async () => {
    const anchor = { event_id: 'event-1', cluster_key: 'cluster-1' };
    const clusterEvents = [anchor, { event_id: 'event-2', cluster_key: 'cluster-1' }];
    mocks.connection.query.mockImplementation((sql) => {
      if (sql.includes('WHERE event_id = ? LIMIT 1 FOR UPDATE')) return Promise.resolve([[anchor]]);
      if (sql.includes('WHERE cluster_key = ?')) return Promise.resolve([clusterEvents]);
      if (sql.startsWith('UPDATE security_events')) return Promise.resolve([{ affectedRows: 1 }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const res = createResponse();

    await batchSetSecurityReviewDisposition(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: null,
        body: {
          eventIds: ['event-1'],
          scope: 'clusters',
          disposition: 'confirmed_attack',
          reason: '批量复核',
        },
      },
      res,
    );

    expect(mocks.connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.applySecurityEventHandle).toHaveBeenCalledTimes(2);
    expect(mocks.connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.connection.rollback).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ status: 200, data: { selectedTotal: 1, handledTotal: 2 } });
  });

  it('任一事件不存在时回滚整批操作', async () => {
    mocks.connection.query.mockResolvedValueOnce([[]]);
    const res = createResponse();

    await batchSetSecurityReviewDisposition(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: null,
        body: { eventIds: ['missing-event'], scope: 'events', disposition: 'false_positive' },
      },
      res,
    );

    expect(mocks.connection.rollback).toHaveBeenCalledTimes(1);
    expect(mocks.connection.commit).not.toHaveBeenCalled();
    expect(mocks.applySecurityEventHandle).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('待复核列表和角标统一只统计 unknown 且处于 new/reviewing 的事件', async () => {
    mocks.pool.query.mockResolvedValueOnce([[{ disposition: 'unknown', total: 26 }]]).mockResolvedValueOnce([[]]);
    const res = createResponse();

    await getSecurityReviewClusters(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: null,
        body: { pageSize: 100, filters: { days: 7, disposition: 'unknown', viewMode: 'raw' } },
      },
      res,
    );

    const countSql = mocks.pool.query.mock.calls[0][0];
    const listSql = mocks.pool.query.mock.calls[1][0];
    expect(countSql).toContain("e.disposition <> 'unknown' OR e.workflow_status IN ('new','reviewing')");
    expect(listSql).toContain("e.workflow_status IN ('new','reviewing')");
    expect(res.body).toMatchObject({ status: 200, data: { counts: [{ disposition: 'unknown', total: 26 }] } });
  });
});

describe('securityV2Handle 安全态势', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.query.mockReset();
  });

  it('最吵规则直接按安全事件聚合，并回传命中量与当前运行模式', async () => {
    mocks.pool.query
      .mockResolvedValueOnce([
        [
          {
            pendingReview: 0,
            confirmedAttacks: 3,
            falsePositives: 10,
            authorizedTests: 1,
            benignAnomalies: 4,
            highConfidenceBlocks: 13,
            pendingHighConfidence: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([
        [
          {
            statDate: '2026-08-09',
            raw: 17,
            confirmed: 3,
            falsePositive: 10,
            benignAnomaly: 2,
            authorizedTest: 1,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            ruleCode: 'SSRF_PRIVATE_HOST',
            ruleName: 'SSRF 内网地址访问',
            rawHits: '17',
            confirmedHits: '3',
            falsePositiveHits: '10',
            falsePositiveRate: '59',
            primaryRoute: '/chat/generateBookmarkMeta',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ ruleCode: 'SSRF_PRIVATE_HOST', mode: 'block', version: 4 }]]);
    const res = createResponse();

    await getSecurityOverviewV2(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: null,
        body: { days: 7 },
      },
      res,
    );

    const noisyRulesSql = mocks.pool.query.mock.calls[3][0];
    expect(noisyRulesSql).toContain('FROM security_events e');
    expect(noisyRulesSql).not.toContain('security_event_evidence');
    expect(res.body).toMatchObject({
      status: 200,
      data: {
        summary: { confirmedAttacks: 3, falsePositiveRate: 59, policyVersion: 4 },
        trend: expect.arrayContaining([
          expect.objectContaining({
            date: '2026-08-09',
            raw: 17,
            confirmed: 3,
            falsePositive: 10,
            benignAnomaly: 2,
            authorizedTest: 1,
          }),
        ]),
        noisyRules: [
          {
            ruleCode: 'SSRF_PRIVATE_HOST',
            mode: 'block',
            rawHits: 17,
            confirmedHits: 3,
            falsePositiveHits: 10,
            falsePositiveRate: 59,
            primaryRoute: '/chat/generateBookmarkMeta',
          },
        ],
      },
    });
  });
});

describe('securityV2Handle 检测质量规则配置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.query.mockReset();
  });

  it('同时返回系统默认规则与已发布覆盖策略的完整生效配置', async () => {
    mocks.pool.query
      .mockResolvedValueOnce([
        [
          { rule_code: 'API_ENUMERATION', rule_name: '接口枚举', base_score: 30 },
          { rule_code: 'CRLF_INJECTION', rule_name: 'CRLF 注入', base_score: 35 },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            rule_code: 'CRLF_INJECTION',
            mode: 'block',
            score_override: 48,
            route_pattern: '/resolve/*',
            request_method: 'POST',
            field_pattern: 'url',
            expires_at: '2026-08-31 23:59:00',
            reason: '仅收紧解析接口',
            version: 7,
          },
        ],
      ]);
    const res = createResponse();

    await getSecurityRuleQuality(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: null,
        body: { days: 7 },
      },
      res,
    );

    expect(res.body.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({
      rule_code: 'API_ENUMERATION',
      effectiveScore: 30,
      hasOverride: false,
      routePattern: '',
      requestMethod: '',
      fieldPattern: '',
      reason: '',
    });
    expect(res.body.data.items[1]).toMatchObject({
      rule_code: 'CRLF_INJECTION',
      mode: 'block',
      effectiveScore: 48,
      hasOverride: true,
      policyVersion: 7,
      routePattern: '/resolve/*',
      requestMethod: 'POST',
      fieldPattern: 'url',
      expiresAt: '2026-08-31 23:59:00',
      reason: '仅收紧解析接口',
    });
  });
});

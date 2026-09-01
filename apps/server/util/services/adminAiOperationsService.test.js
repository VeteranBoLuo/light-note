import { describe, expect, it, vi } from 'vitest';
import {
  adminAiOperationsServiceInternals,
  getAdminAiExecutionDetail,
  getAdminAiOperationsOverview,
  normalizeAdminAiOperationsQuery,
  queryAdminAiExecutions,
} from './adminAiOperationsService.js';

const EXECUTION_ONE = '7bc4f1a8-0d1e-4c60-a9d3-1974332a7c4d';
const EXECUTION_TWO = '0fb6bbcd-a895-45fa-9c20-55903f997b29';

function executionRow(overrides = {}) {
  return {
    id: EXECUTION_ONE,
    request_id: 'request-1',
    actor_user_id: 'actor-1',
    actor_alias: 'Alice',
    actor_role: 'user',
    subject_user_id: 'actor-1',
    subject_alias: 'Alice',
    subject_role: 'user',
    billing_policy: 'user',
    surface: 'note-library',
    skill_id: 'note.transform_text',
    task_type: 'skill_note_transform_text',
    skill_version: 3,
    billing_rule_version: 2,
    validation_rule_version: 5,
    status: 'success',
    model_called: 1,
    provider_call_count: 1,
    provider_tokens: 1200,
    charged_tokens: 900,
    usage_complete: 1,
    quota_settlement_status: 'reconciled',
    error_code: null,
    duration_ms: 1800,
    stale_running: 0,
    created_at: new Date('2026-08-28T04:00:00Z'),
    updated_at: new Date('2026-08-28T04:00:02Z'),
    ...overrides,
  };
}

function spanRow(overrides = {}) {
  return {
    execution_id: EXECUTION_ONE,
    stage: 'skill_note_transform_text',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    status: 'success',
    trigger_code: null,
    usage_status: 'reported',
    billing_scope: 'user',
    sequence_no: 1,
    estimated_tokens: 3000,
    prompt_tokens: 800,
    completion_tokens: 400,
    total_tokens: 1200,
    estimated_cost: '0.001600',
    duration_ms: 1500,
    error_code: null,
    created_at: new Date('2026-08-28T04:00:01Z'),
    ...overrides,
  };
}

describe('adminAiOperationsService', () => {
  it('需要关注只聚合技术失败、过期运行、用量缺失与结算异常', () => {
    const sql = adminAiOperationsServiceInternals.ATTENTION_SQL;
    expect(sql).toContain("e.status = 'failed'");
    expect(sql).toContain("e.status = 'running'");
    expect(sql).toContain('e.usage_complete = 0');
    expect(sql).toContain("'pending', 'deferred', 'reservation_failed'");
    expect(sql).not.toContain('quota_blocked');
    expect(sql).not.toContain('aborted');
  });

  it('查询条件只接受时间、模块、状态和 Provider 白名单，并默认隐藏内部账号', () => {
    expect(
      normalizeAdminAiOperationsQuery({
        periodDays: 30,
        module: 'NOTE',
        status: 'ATTENTION',
        provider: 'QWEN',
        keyword: `  ${'a'.repeat(100)}  `,
        hideInternal: false,
        limit: 999,
      }),
    ).toEqual({
      periodDays: 30,
      module: 'note',
      status: 'attention',
      provider: 'qwen',
      keyword: 'a'.repeat(80),
      hideInternal: false,
      limit: 100,
    });
    expect(
      normalizeAdminAiOperationsQuery({ periodDays: 365, module: 'secret', status: 'oops', provider: '../x' }),
    ).toMatchObject({ periodDays: 7, module: 'all', status: 'all', provider: 'all', hideInternal: true });
  });

  it('总览的全部统计链路使用统一执行账本并在每个分母上过滤内部账号', async () => {
    const database = {
      query: vi.fn(async (sql) => {
        const statement = String(sql);
        if (statement.includes('AS quality_sample')) {
          return [
            [
              {
                executions: 4,
                actors: 2,
                model_actions: 4,
                provider_calls: 5,
                provider_tokens: 5000,
                charged_tokens: 4200,
                platform_covered_tokens: 800,
                succeeded: 2,
                partial: 1,
                failed: 1,
                quota_blocked: 0,
                aborted: 0,
                running: 0,
                stale_running: 0,
                usage_missing: 1,
                settlement_attention: 1,
                quality_sample: 4,
                average_duration_ms: 3200,
              },
            ],
          ];
        }
        if (statement.includes('GROUP BY usage_date')) {
          return [
            [
              {
                usage_date: '2026-08-28',
                executions: 4,
                model_actions: 4,
                provider_tokens: 5000,
                charged_tokens: 4200,
                delivered: 3,
                failures: 1,
              },
            ],
          ];
        }
        if (statement.includes('GROUP BY e.skill_id')) {
          return [
            [
              {
                skill_id: 'note.transform_text',
                task_type: 'skill_note_transform_text',
                executions: 3,
                model_actions: 3,
                provider_tokens: 4200,
                charged_tokens: 3400,
                failures: 1,
              },
              {
                skill_id: 'bookmark.summarize_page',
                task_type: 'skill_bookmark_summarize_page',
                executions: 1,
                model_actions: 1,
                provider_tokens: 800,
                charged_tokens: 800,
                failures: 0,
              },
            ],
          ];
        }
        if (statement.includes('GROUP BY span.provider')) {
          return [
            [
              {
                provider: 'deepseek',
                model: 'deepseek-v4-flash',
                calls: 5,
                tokens: 5000,
                estimated_cost: '0.008600',
                failed_calls: 1,
                missing_usage_calls: 1,
                platform_calls: 1,
              },
            ],
          ];
        }
        if (statement.includes('ORDER BY e.duration_ms ASC')) return [[{ duration_ms: 9000 }]];
        throw new Error(`unexpected query: ${statement}`);
      }),
    };

    const result = await getAdminAiOperationsOverview(
      { periodDays: 7, hideInternal: true },
      database,
      new Date('2026-08-28T12:00:00Z'),
    );

    expect(result.summary).toMatchObject({
      modelActions: 4,
      providerCalls: 5,
      providerTokens: 5000,
      estimatedCost: 0.0086,
      deliveryRate: 75,
      technicalErrorRate: 25,
      durationP95: 9000,
      anomalySignals: 3,
    });
    expect(result.daily).toHaveLength(7);
    expect(result.daily.at(-1)).toMatchObject({ date: '2026-08-28', providerTokens: 5000, failures: 1 });
    expect(result.modules.map((item) => item.module)).toEqual(['note', 'bookmark']);
    expect(result.providers[0]).toMatchObject({ provider: 'deepseek', calls: 5, platformCalls: 1 });

    const statements = database.query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toHaveLength(5);
    for (const statement of statements) {
      expect(statement).toContain('ai_executions e');
      expect(statement).toContain('actor.role NOT IN');
      expect(statement).not.toContain('agent_logs');
    }
  });

  it('执行列表先游标查询根执行，再一次批量读取当前页 Span，且游标绑定全部筛选条件', async () => {
    const rows = [
      executionRow(),
      executionRow({
        id: EXECUTION_TWO,
        request_id: 'request-2',
        created_at: new Date('2026-08-28T03:00:00Z'),
      }),
    ];
    const database = {
      query: vi.fn(async (sql, params) => {
        const statement = String(sql);
        if (statement.includes('SELECT e.id') && statement.includes('LIMIT ?')) return [rows];
        if (statement.includes('SELECT COUNT(*) AS total')) return [[{ total: 2 }]];
        if (statement.includes('FROM ai_provider_spans') && statement.includes('execution_id IN')) {
          expect(params).toEqual([EXECUTION_ONE]);
          return [[spanRow()]];
        }
        throw new Error(`unexpected query: ${statement}`);
      }),
    };

    const result = await queryAdminAiExecutions(
      { periodDays: 7, keyword: 'Alice', hideInternal: true, limit: 1, cursor: null },
      database,
    );

    expect(result).toMatchObject({ total: 2, hasMore: true });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: EXECUTION_ONE,
      actionId: 'note.transform_text',
      module: 'note',
      actor: { id: 'actor-1', alias: 'Alice' },
      providers: ['deepseek'],
      models: ['deepseek-v4-flash'],
      estimatedCost: 0.0016,
    });
    expect(result.items[0]).not.toHaveProperty('taskType');
    expect(result.items[0]).not.toHaveProperty('question');
    expect(database.query).toHaveBeenCalledTimes(3);

    const cursorDatabase = { query: vi.fn() };
    await expect(
      queryAdminAiExecutions(
        { periodDays: 7, keyword: 'Bob', hideInternal: true, limit: 1, cursor: result.nextCursor },
        cursorDatabase,
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_LIST_CURSOR_INVALID', status: 400 });
    expect(cursorDatabase.query).not.toHaveBeenCalled();
  });

  it('Provider 筛选使用 Span EXISTS，不通过列表 JOIN 制造重复根执行', async () => {
    const statements = [];
    const database = {
      query: vi.fn(async (sql) => {
        const statement = String(sql);
        statements.push(statement);
        if (statement.includes('SELECT e.id')) return [[]];
        if (statement.includes('SELECT COUNT(*) AS total')) return [[{ total: 0 }]];
        throw new Error(`unexpected query: ${statement}`);
      }),
    };

    await queryAdminAiExecutions({ provider: 'deepseek', cursor: null }, database);

    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement).toContain('EXISTS (');
      expect(statement).toContain('provider_filter.execution_id = e.id');
      expect(statement).not.toMatch(/JOIN\s+ai_provider_spans\s+provider_filter/iu);
    }
  });

  it('详情只返回治理元数据，并复用个人用量页的阶段、修复原因与错误分类', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            executionRow({
              status: 'partial',
              usage_complete: 0,
              quota_settlement_status: 'deferred',
              error_code: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
            }),
          ],
        ])
        .mockResolvedValueOnce([
          [
            spanRow(),
            spanRow({
              stage: 'skill_note_transform_text_repair',
              billing_scope: 'platform',
              sequence_no: 2,
              trigger_code: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
              prompt_tokens: 200,
              completion_tokens: 100,
              total_tokens: 300,
              estimated_cost: '0.000400',
            }),
          ],
        ]),
    };

    const result = await getAdminAiExecutionDetail(EXECUTION_ONE, database);

    expect(result.execution).toMatchObject({
      id: EXECUTION_ONE,
      status: 'partial',
      errorCategory: 'output_invalid',
      errorCode: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
      platformCalls: 1,
      usageAttention: true,
      settlementAttention: true,
    });
    expect(result.calls[1]).toMatchObject({
      sequenceNo: 2,
      stageType: 'output_repair',
      billingScope: 'platform',
      triggerReason: 'source_required',
      estimatedCost: 0.0004,
    });
    expect(result.calls[1]).not.toHaveProperty('stage');
    expect(result.calls[1]).not.toHaveProperty('triggerCode');
    expect(result.calls[1]).not.toHaveProperty('errorCode');
    expect(JSON.stringify(result)).not.toMatch(/question|answer|content|resourceTitle|url/iu);
  });

  it('存储异常收口为稳定 503，不泄露数据库连接信息', async () => {
    const database = { query: vi.fn().mockRejectedValue(new Error('password@private-db-host')) };
    await expect(getAdminAiOperationsOverview({}, database)).rejects.toMatchObject({
      code: 'AI_OPERATIONS_STORE_UNAVAILABLE',
      status: 503,
      message: 'AI 运行账本暂不可用',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/index.js', () => ({ default: { query: mocks.query } }));

const { default: getActiveUsers } = await import('./get_active_users.js');
const { default: getSecurityEvents } = await import('./get_security_events.js');
const { default: getTokenUsage } = await import('./get_token_usage.js');
const { default: getPendingFeedback } = await import('./get_pending_feedback.js');
const { default: queryApiLogs } = await import('./query_api_logs.js');
const { default: queryFeedback } = await import('./query_feedback.js');
const { default: queryOperationLogs } = await import('./query_operation_logs.js');
const { default: queryTrash } = await import('./query_trash.js');
const { default: queryUsers } = await import('./query_users.js');

const context = {
  userId: 'target-user',
  temporalContext: {
    currentInstant: '2026-08-21T04:00:00Z',
    timeZone: 'Asia/Shanghai',
    storageTimeZone: 'Asia/Shanghai',
  },
};

describe('Agent 列表工具最低结果契约', () => {
  beforeEach(() => vi.clearAllMocks());

  it('管理日志按 canonical scope_user 限定目标账号并返回精确 total/稳定 ID', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ id: 'api-1', url: '/api/test', status_code: '200' }]])
      .mockResolvedValueOnce([[{ total: '3' }]]);

    const raw = await queryApiLogs.execute({ scope_user: 'target@example.test', timeRange: '今天', limit: 1 }, context);
    const [listSql, listParams] = mocks.query.mock.calls[0];
    expect(listSql).toContain('a.request_time >= ? AND a.request_time < ?');
    expect(listSql).toContain('a.user_id = ?');
    expect(listParams).toContain('target-user');
    expect(raw.resultMetadata).toMatchObject({ total: 3, returned: 1, completeness: 'partial' });
    expect(queryApiLogs.getDependencyRefs(raw)).toEqual([{ type: 'api_log', id: 'api-1' }]);
    expect(queryApiLogs.summarize(raw)).toBe('API 日志：共 3 条；已返回 1 条（状态码：200:1）');
  });

  it('操作日志使用同一管理账号契约和半开时间边界', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ id: 'op-1', module: 'note', operation: 'create' }]])
      .mockResolvedValueOnce([[{ total: '1' }]]);

    const raw = await queryOperationLogs.execute({ scope_user: 'target-user', timeRange: '今天' }, context);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain('ol.create_time >= ? AND ol.create_time < ?');
    expect(sql).toContain('ol.create_by = ?');
    expect(params).toContain('target-user');
    expect(raw.resultMetadata).toMatchObject({ total: 1, returned: 1, completeness: 'complete' });
    expect(queryOperationLogs.getDependencyRefs(raw)).toEqual([{ type: 'operation_log', id: 'op-1' }]);
    expect(queryOperationLogs.summarize(raw)).toBe('操作日志：共 1 条；已返回 1 条（模块：note）');
  });

  it('用户与活跃用户列表都返回精确总数和用户稳定引用', async () => {
    mocks.query.mockResolvedValueOnce([[{ id: 'user-1', alias: '甲' }]]).mockResolvedValueOnce([[{ total: '2' }]]);
    const users = await queryUsers.execute({ registeredWithin: '今天', limit: 1 }, context);
    expect(users.resultMetadata).toMatchObject({ total: 2, returned: 1, truncated: true });
    expect(queryUsers.getDependencyRefs(users)).toEqual([{ type: 'user', id: 'user-1' }]);

    mocks.query
      .mockResolvedValueOnce([[{ user_id: 'user-2', alias: '乙', request_count: 5 }]])
      .mockResolvedValueOnce([[{ total: '4' }]]);
    const active = await getActiveUsers.execute({ timeRange: '今天', limit: 1 }, context);
    expect(active.resultMetadata).toMatchObject({ total: 4, returned: 1, completeness: 'partial' });
    expect(getActiveUsers.getDependencyRefs(active)).toEqual([{ type: 'user', id: 'user-2' }]);
  });

  it('安全事件和回收站结果保留稳定 ID，并披露列表是否完整', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ event_id: 'security-event-7', attack_type: 'XSS', source_ip: '127.0.0.1' }]])
      .mockResolvedValueOnce([[{ total: '2' }]]);
    const events = await getSecurityEvents.execute({ timeRange: '今天', limit: 1 }, context);
    expect(events.resultMetadata).toMatchObject({ total: 2, returned: 1, truncated: true });
    expect(getSecurityEvents.getDependencyRefs(events)).toEqual([{ type: 'security_event', id: 'security-event-7' }]);

    mocks.query
      .mockResolvedValueOnce([[{ id: 'bookmark-1', name: '已删除书签', resourceType: 'bookmark' }]])
      .mockResolvedValueOnce([[{ cnt: '5' }]]);
    const trash = await queryTrash.execute({ type: 'bookmark', timeRange: '今天', limit: 1 }, context);
    expect(trash.resultMetadata).toMatchObject({ total: 5, returned: 1, completeness: 'partial' });
    expect(queryTrash.getDependencyRefs(trash)).toEqual([{ type: 'bookmark', id: 'bookmark-1' }]);
  });

  it('聚合统计同样携带可核验的 resolved range', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ request_count: 2, total_prompt: 10, total_completion: 20, total_tokens: 30, total_cost: 0.01 }],
    ]);
    const raw = await getTokenUsage.execute({ timeRange: '今天', scope_user: 'target-user' }, context);

    expect(mocks.query.mock.calls[0][0]).toContain('created_at >= ? AND created_at < ?');
    expect(mocks.query.mock.calls[0][0]).toContain('user_id = ?');
    expect(raw.resultMetadata).toMatchObject({
      completeness: 'complete',
      resolvedRanges: { timeRange: { expression: '今天', range: { timeZone: 'Asia/Shanghai' } } },
    });
  });

  it('Root 待回复反馈返回精确 total 和稳定反馈 ID', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ c: '4' }]])
      .mockResolvedValueOnce([
        [{ id: 'feedback-1', type: 'bug', content: '无法保存', alias: '甲', create_time: null }],
      ]);

    const raw = await getPendingFeedback.execute({ limit: 1 }, context);

    expect(raw).toMatchObject({ total: 4, pending: 4 });
    expect(raw.resultMetadata).toMatchObject({ total: 4, returned: 1, completeness: 'partial' });
    expect(getPendingFeedback.getDependencyRefs(raw)).toEqual([{ type: 'feedback', id: 'feedback-1' }]);
  });

  it('个人反馈的 total 来自独立 COUNT，而不是当前 LIMIT 页长度', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ type: 'bug', content: '无法保存', status: 'pending', create_time: null }]])
      .mockResolvedValueOnce([[{ total: '7' }]]);

    const raw = await queryFeedback.execute({ limit: 1 }, { userId: 'user-1', userRole: 'user' });

    expect(raw).toMatchObject({ total: 7, items: [expect.objectContaining({ content: '无法保存' })] });
    expect(raw.resultMetadata).toMatchObject({ totalCount: 7, returned: 1, completeness: 'partial' });
    expect(mocks.query.mock.calls[1][0]).toContain('COUNT(*) AS total');
    expect(queryFeedback.transform(raw)).toContain('共 7 条，当前返回 1 条');
  });
});

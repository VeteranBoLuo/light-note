import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const getConnection = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};

vi.mock('../db/index.js', () => ({
  default: { query, getConnection },
}));

const { getAdminActionCenter, retryAdminAsyncJob, adminActionCenterInternals } =
  await import('./adminActionCenterHandle.js');

function response() {
  return {
    body: null,
    send(payload) {
      this.body = payload;
      return payload;
    },
  };
}

function rowsFor(sql) {
  const statement = String(sql);
  if (statement.includes('SELECT role, del_flag FROM user')) return [[{ role: 'root', del_flag: 0 }]];
  if (statement.includes('INSERT INTO admin_operation_audit')) return [{ affectedRows: 1 }];
  const summary = statement.includes('COUNT(*) AS total');
  if (statement.includes('FROM opinion')) {
    return summary
      ? [[{ total: 2 }]]
      : [[{ id: 'op-1', type: '功能建议', user_id: 'u-1', alias: '用户甲', create_time: '2026-08-09 10:00:00' }]];
  }
  if (statement.includes('FROM security_events')) {
    return summary
      ? [[{ total: 1, critical: 1 }]]
      : [
          [
            {
              event_id: 'sec-1',
              attack_type: 'XSS',
              severity: 'critical',
              threat_score: 98,
              created_at: '2026-08-09 11:00:00',
            },
          ],
        ];
  }
  if (statement.includes('FROM community_chat_reports'))
    throw Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
  if (statement.includes('FROM ai_feedback')) {
    return summary
      ? [[{ total: 1, critical: 0 }]]
      : [
          [
            {
              id: 'feedback-1',
              reason: 'incorrect',
              actor_user_id: 'u-3',
              alias: '用户丙',
              triage_status: 'open',
              triage_priority: 'high',
              update_time: '2026-08-09 11:30:00',
            },
          ],
        ];
  }
  if (statement.includes('FROM ai_document_jobs')) {
    return summary
      ? [[{ total: 4, attention: 1, running: 1, waiting: 2, completed_24h: 8 }]]
      : [
          [
            {
              id: 11,
              source_id: 'source-1',
              status: 'failed',
              attempts: 3,
              file_name: '计划.docx',
              user_id: 'u-1',
              alias: '用户甲',
              update_time: '2026-08-09 12:00:00',
            },
          ],
        ];
  }
  if (statement.includes('FROM bookmark_icon_jobs')) {
    return summary
      ? [[{ total: 2, attention: 1, running: 0, waiting: 1, completed_24h: 10 }]]
      : [
          [
            {
              id: 12,
              status: 'retry_wait',
              attempts: 2,
              origin_key: 'https://example.com',
              user_id: 'u-2',
              update_time: '2026-08-09 08:00:00',
            },
          ],
        ];
  }
  if (statement.includes('FROM todo_reminder_jobs')) {
    return summary
      ? [[{ total: 3, attention: 1, running: 1, waiting: 1, completed_24h: 5 }]]
      : [
          [
            {
              id: 'todo-job-1',
              status: 'unknown',
              retry_count: 1,
              title: '提醒',
              user_id: 'u-3',
              update_time: '2026-08-09 07:00:00',
            },
          ],
        ];
  }
  if (statement.includes('FROM account_deletion_requests')) {
    return summary
      ? [[{ total: 1, attention: 1, running: 0, waiting: 0, completed_24h: 2 }]]
      : [
          [
            {
              id: 'delete-request-1',
              status: 'retry_wait',
              attempts: 2,
              user_id: 'private-user-id',
              update_time: '2026-08-09 06:00:00',
            },
          ],
        ];
  }
  if (statement.includes('FROM email_delivery_logs')) {
    return summary
      ? [[{ total: 1, attention: 1, running: 0, waiting: 0, completed_24h: 12 }]]
      : [
          [
            {
              id: 'mail-1',
              status: 'failed',
              recipient_email: 'private@example.com',
              subject: '提醒',
              attempt_no: 2,
              update_time: '2026-08-09 05:00:00',
            },
          ],
        ];
  }
  throw new Error(`unexpected query: ${statement}`);
}

describe('后台统一待处理中心', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql) => rowsFor(sql));
    getConnection.mockReset();
    getConnection.mockResolvedValue(connection);
    vi.clearAllMocks();
    connection.query.mockReset();
    query.mockImplementation(async (sql) => rowsFor(sql));
    getConnection.mockResolvedValue(connection);
    connection.beginTransaction.mockResolvedValue();
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
  });

  it('非 Root 无法读取跨业务待处理数据', async () => {
    const res = response();
    await getAdminActionCenter({ user: { role: 'user' }, body: {} }, res);
    expect(res.body).toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });

  it('聚合人工队列与任务健康，单个可选来源缺失时其余数据仍可用', async () => {
    const res = response();
    await getAdminActionCenter({ user: { role: 'root' }, body: { limit: 20 } }, res);

    expect(res.body).toMatchObject({
      status: 200,
      data: {
        unavailableSources: ['community_report'],
        work: { total: 4, critical: 1 },
        jobs: { attention: 5, running: 2, waiting: 4, completed24h: 37 },
      },
    });
    expect(res.body.data.jobs.items.find((item) => item.source === 'todo_reminder')).toMatchObject({
      status: 'attention',
      canRetry: false,
    });
    expect(res.body.data.jobs.items.find((item) => item.source === 'ai_document')).toMatchObject({
      status: 'attention',
      canRetry: true,
    });
    const email = res.body.data.jobs.items.find((item) => item.source === 'email_delivery');
    expect(email.ownerLabel).not.toContain('private@');
    expect(JSON.stringify(res.body)).not.toContain('private@example.com');
  });

  it('限制单来源读取数量并脱敏邮箱', () => {
    expect(adminActionCenterInternals.itemLimit(999)).toBe(60);
    expect(adminActionCenterInternals.itemLimit(1)).toBe(5);
    expect(adminActionCenterInternals.itemSource('bookmark_icon')).toBe('bookmark_icon');
    expect(adminActionCenterInternals.itemSource('unknown_source')).toBeNull();
    expect(adminActionCenterInternals.maskEmail('abcdef@example.com')).toBe('ab****@example.com');
  });

  it('按来源筛选后再限制明细数量，避免其他队列挤掉书签图标异常', async () => {
    const res = response();
    await getAdminActionCenter({ user: { role: 'root' }, body: { limit: 5, source: 'bookmark_icon' } }, res);

    expect(res.body).toMatchObject({ status: 200 });
    expect(res.body.data.work.items).toEqual([]);
    expect(res.body.data.jobs.items).toHaveLength(1);
    expect(res.body.data.jobs.items.every((item) => item.source === 'bookmark_icon')).toBe(true);
  });

  it('拒绝未知来源筛选且不查询数据库', async () => {
    const res = response();
    await getAdminActionCenter({ user: { role: 'root' }, body: { source: 'unknown_source' } }, res);

    expect(res.body).toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });

  it('明确失败的文档任务可在必需审计事务内重新入队', async () => {
    connection.query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('SELECT id, source_id, status FROM ai_document_jobs')) {
        return [[{ id: 11, source_id: 'source-1', status: 'failed' }]];
      }
      if (statement.includes('UPDATE ai_document_jobs')) return [{ affectedRows: 1 }];
      if (statement.includes('UPDATE ai_document_sources')) return [{ affectedRows: 1 }];
      if (statement.includes('INSERT INTO admin_operation_audit')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected connection query: ${statement}`);
    });
    const res = response();
    await retryAdminAsyncJob(
      {
        user: { id: 'root-1', role: 'root' },
        body: {
          source: 'ai_document',
          id: '11',
          reason: '重新解析用户确认可用的文档',
          confirmed: true,
          confirmText: '确认重试任务',
        },
      },
      res,
    );
    expect(res.body).toMatchObject({ status: 200, data: { source: 'ai_document', id: '11', status: 'queued' } });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('admin_operation_audit'))).toBe(true);
  });

  it('邮件结果未知的提醒任务不可盲目重试', async () => {
    connection.query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('SELECT id, status, channel FROM todo_reminder_jobs')) {
        return [[{ id: 'job-1', status: 'unknown', channel: 'email' }]];
      }
      throw new Error(`unexpected connection query: ${statement}`);
    });
    const res = response();
    await retryAdminAsyncJob(
      {
        user: { id: 'root-1', role: 'root' },
        body: {
          source: 'todo_reminder',
          id: 'job-1',
          reason: '尝试重新发送这条提醒任务',
          confirmed: true,
          confirmText: '确认重试任务',
        },
      },
      res,
    );
    expect(res.body).toMatchObject({ status: 409 });
    expect(res.body.msg).toContain('重复提醒');
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});

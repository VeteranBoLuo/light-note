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

const {
  dismissAdminAsyncJob,
  getAdminActionCenter,
  getAdminFilePreviewDiagnostic,
  getAdminTodoReminderDiagnostic,
  retryAdminAsyncJob,
  adminActionCenterInternals,
} = await import('./adminActionCenterHandle.js');

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
  if (statement.includes('FROM feature_requests')) {
    return summary
      ? [[{ total: 1, critical: 0 }]]
      : [
          [
            {
              id: 'feature-1',
              title: '支持更好的检索',
              category: 'search',
              submitter_user_id: 'u-4',
              vote_count: 8,
              alias: '用户丁',
              create_time: '2026-08-09 09:00:00',
              update_time: '2026-08-09 09:30:00',
            },
          ],
        ];
  }
  if (statement.includes('FROM resource_governance_findings')) {
    return summary
      ? [[{ total: 1, critical: 1 }]]
      : [
          [
            {
              id: 'finding-1',
              issue_code: 'OWNER_MISSING',
              resource_type: 'file',
              risk_level: 'blocked',
              observation_count: 2,
              estimated_bytes: 1024,
              first_seen_at: '2026-08-09 08:00:00',
              last_seen_at: '2026-08-09 10:00:00',
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
              scheduled_at_utc_iso: '2026-08-09T01:00:00Z',
              scheduled_at_beijing: '2026-08-09 09:00:00',
              scheduled_at_local_text: '2026-08-09 09:00:00',
              timezone: 'Asia/Shanghai',
              attention_reason: 'delivery_unknown',
              group_count: 1,
              update_time: '2026-08-09 07:00:00',
            },
            {
              id: 'todo-job-2',
              status: 'pending',
              retry_count: 0,
              title: '点外卖',
              user_id: 'u-3',
              scheduled_at_utc_iso: '2026-08-12T03:10:00Z',
              scheduled_at_beijing: '2026-08-12 11:10:00',
              scheduled_at_local_text: '2026-08-12 11:10:00',
              timezone: 'Asia/Shanghai',
              attention_reason: null,
              group_count: 5,
              update_time: '2026-08-09 06:00:00',
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
  if (statement.includes('FROM file_preview_jobs')) {
    return summary
      ? [[{ total: 1, attention: 1, running: 0, waiting: 0, completed_24h: 0 }]]
      : [
          [
            {
              id: 'preview-1',
              status: 'failed',
              attempts: 2,
              file_id: 88,
              format_id: 'pdf',
              file_name: '预览文件.pdf',
              owner_user_id: 'u-5',
              alias: '用户戊',
              error_code: 'PREVIEW_CONVERT_FAILED',
              create_time: '2026-08-09 04:00:00',
              update_time: '2026-08-09 05:00:00',
            },
          ],
        ];
  }
  if (statement.includes('FROM resource_cleanup_jobs')) {
    return summary
      ? [[{ total: 1, attention: 1, running: 0, waiting: 0, completed_24h: 0 }]]
      : [
          [
            {
              id: 'cleanup-1',
              risk_level: 'safe',
              status: 'completed_with_errors',
              total: 5,
              succeeded: 4,
              skipped: 0,
              failed: 1,
              last_error_code: 'CLEANUP_ITEM_FAILED',
              create_time: '2026-08-09 03:00:00',
              update_time: '2026-08-09 04:00:00',
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
        work: { total: 6, critical: 2 },
        jobs: { attention: 7, running: 2, waiting: 4, completed24h: 37 },
        sla: { policyVersion: expect.any(String), sampled: true },
      },
    });
    expect(res.body.data.jobs.items.find((item) => item.source === 'todo_reminder')).toMatchObject({
      status: 'attention',
      canRetry: false,
    });
    expect(res.body.data.jobs.items.find((item) => item.id === 'todo-job-2')).toMatchObject({
      status: 'waiting',
      scheduledAtUtc: '2026-08-12T03:10:00Z',
      scheduledAtBeijing: '2026-08-12 11:10:00',
      groupCount: 5,
    });
    expect(res.body.data.jobs.items.find((item) => item.source === 'ai_document')).toMatchObject({
      status: 'attention',
      canRetry: true,
    });
    expect(res.body.data.work.items.find((item) => item.source === 'feature_request')).toMatchObject({
      ownerTeam: '产品共建',
      severity: 'high',
    });
    expect(res.body.data.work.items.find((item) => item.source === 'security')).toMatchObject({
      id: 'sec-1',
      targetUrl: '/securityCenter/review?eventId=sec-1',
    });
    expect(res.body.data.work.items.find((item) => item.source === 'resource_governance')).toMatchObject({
      ownerTeam: '资源治理',
      severity: 'critical',
    });
    const filePreview = res.body.data.jobs.items.find((item) => item.source === 'file_preview');
    expect(filePreview).toMatchObject({
      ownerTeam: '文件预览服务',
      status: 'attention',
    });
    expect(filePreview.targetUrl).toBeUndefined();
    expect(res.body.data.jobs.items.find((item) => item.source === 'resource_cleanup')).toMatchObject({
      ownerTeam: '资源治理',
      status: 'attention',
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
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => String(sql).includes('bookmark_icon_jobs'))).toBe(true);
  });

  it('拒绝未知来源筛选且不查询数据库', async () => {
    const res = response();
    await getAdminActionCenter({ user: { role: 'root' }, body: { source: 'unknown_source' } }, res);

    expect(res.body).toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });

  it('在服务端按分区、SLA 与关键字筛选明细', async () => {
    const res = response();
    await getAdminActionCenter(
      {
        user: { role: 'root' },
        body: { section: 'work', slaState: 'overdue', keyword: 'XSS', limit: 20 },
      },
      res,
    );

    expect(res.body).toMatchObject({
      status: 200,
      data: {
        filters: { section: 'work', source: 'all', status: 'all', slaState: 'overdue', keyword: 'XSS' },
        jobs: { items: [] },
      },
    });
    expect(res.body.data.work.items.every((item) => item.slaState === 'overdue')).toBe(true);
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

  it('按 Job 打开上下文诊断，并同时返回北京时间与同规则近期任务', async () => {
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('JOIN todo_items t')) {
        return [
          [
            {
              id: 'todo-job-2',
              user_id: 'u-3',
              todo_id: 'todo-1',
              series_id: null,
              rule_id: 'rule-1',
              channel: 'in_app',
              status: 'pending',
              retry_count: 0,
              scheduled_at_utc_iso: '2026-08-12T03:10:00Z',
              scheduled_at_beijing: '2026-08-12 11:10:00',
              scheduled_at_local_text: '2026-08-12 11:10:00',
              original_scheduled_at_utc_iso: '2026-08-12T03:10:00Z',
              timezone: 'Asia/Shanghai',
              title: '点外卖',
              description: '每天定时点外卖',
              priority: 1,
              owner_label: '菠萝',
              rule_mode: 'single_schedule',
              trigger_type: 'fixed_time',
              schedule_json: JSON.stringify({
                version: 2,
                schedule: {
                  mode: 'repeat',
                  repeat: { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], localTime: '11:10' },
                },
              }),
              rule_channels: JSON.stringify(['in_app']),
              quiet_policy: 'defer_once',
              attention_reason: null,
            },
          ],
        ];
      }
      if (statement.includes('FROM todo_reminder_jobs') && statement.includes('ORDER BY')) {
        return [
          [
            {
              id: 'todo-job-2',
              todo_id: 'todo-1',
              series_id: null,
              rule_id: 'rule-1',
              channel: 'in_app',
              status: 'pending',
              retry_count: 0,
              scheduled_at_utc_iso: '2026-08-12T03:10:00Z',
              scheduled_at_beijing: '2026-08-12 11:10:00',
              scheduled_at_local_text: '2026-08-12 11:10:00',
              timezone: 'Asia/Shanghai',
              attention_reason: null,
            },
          ],
        ];
      }
      throw new Error(`unexpected query: ${statement}`);
    });
    const res = response();
    await getAdminTodoReminderDiagnostic({ user: { id: 'root-1', role: 'root' }, body: { id: 'todo-job-2' } }, res);

    expect(res.body).toMatchObject({
      status: 200,
      data: {
        timeStandard: { label: '北京时间', utcOffset: '+08:00' },
        todo: { title: '点外卖' },
        job: {
          health: 'waiting',
          scheduledAtUtc: '2026-08-12T03:10:00Z',
          scheduledAtBeijing: '2026-08-12 11:10:00',
        },
        rule: { mode: 'single_schedule', schedule: { mode: 'repeat' } },
      },
    });
    expect(res.body.data.relatedJobs).toHaveLength(1);
  });

  it('文件预览诊断按任务 ID 返回队列与派生文件事实', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 7,
          artifact_id: 19,
          job_status: 'failed',
          attempts: 3,
          available_at: '2026-08-10 16:24:37',
          locked_at: '2026-08-10 16:24:40',
          job_error_code: 'OFFICE_CONVERSION_FAILED',
          job_create_time: '2026-08-10 16:24:37',
          job_update_time: '2026-08-10 16:24:48',
          file_id: 88,
          owner_user_id: 'u-5',
          strategy: 'converted_pdf',
          strategy_version: 1,
          format_id: 'xls',
          source_size: 2048,
          artifact_status: 'failed',
          artifact_size: 0,
          entry_count: 0,
          total_uncompressed_size: 0,
          contains_encrypted: 0,
          suspicious_expansion: 0,
          artifact_error_code: 'OFFICE_CONVERSION_FAILED',
          file_name: '5880线缆选型.xls',
          file_type: 'application/vnd.ms-excel',
          file_size: 2048,
          owner_label: '123',
        },
      ],
    ]);
    const res = response();

    await getAdminFilePreviewDiagnostic({ user: { id: 'root-1', role: 'root' }, body: { id: '7' } }, res);

    expect(res.body).toMatchObject({
      status: 200,
      data: {
        file: { id: '88', name: '5880线缆选型.xls', size: 2048, ownerLabel: '123' },
        job: {
          id: '7',
          status: 'failed',
          health: 'attention',
          attentionReason: 'processing_failed',
          errorCode: 'OFFICE_CONVERSION_FAILED',
        },
        artifact: { id: '19', strategy: 'converted_pdf', formatId: 'xls', status: 'failed' },
      },
    });
    expect(String(query.mock.calls[0][0])).toContain('WHERE j.id = ?');
    expect(query.mock.calls[0][1]).toEqual(['7']);
  });

  it('已查看的书签图标失败任务可取消并从异常列表移除', async () => {
    connection.query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('SELECT id, status FROM bookmark_icon_jobs')) return [[{ id: 12, status: 'failed' }]];
      if (statement.includes('UPDATE bookmark_icon_jobs')) return [{ affectedRows: 1 }];
      if (statement.includes('INSERT INTO admin_operation_audit')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected connection query: ${statement}`);
    });
    const res = response();
    await dismissAdminAsyncJob(
      {
        user: { id: 'root-1', role: 'root' },
        body: { source: 'bookmark_icon', id: '12', reason: '管理员已查看并移除异常', confirmed: true },
      },
      res,
    );

    expect(res.body).toMatchObject({ status: 200, data: { status: 'cancelled' } });
    expect(connection.commit).toHaveBeenCalledOnce();
  });
});

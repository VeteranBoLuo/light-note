import { describe, expect, it, vi } from 'vitest';
import { maskAuditIp, recordAdminOperationAudit, sanitizeAuditMetadata } from './adminOperationAudit.js';

describe('管理员操作审计', () => {
  it('IP 只保留网段，元数据剔除敏感字段', () => {
    expect(maskAuditIp('::ffff:192.168.1.88')).toBe('192.168.1.0');
    expect(maskAuditIp('2001:db8:1234:5678:90ab:cdef:1:2')).toBe('2001:db8:1234:5678::');
    const metadata = sanitizeAuditMetadata({
      source: 'action_center',
      password: 'secret',
      nested: { token: 'private', count: 2 },
    });
    expect(metadata).toContain('action_center');
    expect(metadata).not.toContain('secret');
    expect(metadata).not.toContain('private');
  });

  it('必需审计写入失败时抛错，调用方可回滚业务事务', async () => {
    const db = {
      query: vi.fn().mockRejectedValue(Object.assign(new Error('missing table'), { code: 'ER_NO_SUCH_TABLE' })),
    };
    await expect(
      recordAdminOperationAudit(
        { actorUserId: 'root-1', action: 'async_job.retry', outcome: 'succeeded', reason: '重试失败任务' },
        { db, required: true },
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_AUDIT_UNAVAILABLE' });
  });

  it('不在审计元数据中保存敏感内容', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await recordAdminOperationAudit(
      {
        actorUserId: 'root-1',
        action: 'ai_feedback.triage',
        outcome: 'succeeded',
        reason: '处理用户反馈',
        metadata: { sql: "UPDATE user SET password='secret'", tableHints: ['user'] },
      },
      { db, required: true },
    );
    expect(JSON.stringify(db.query.mock.calls[0])).not.toContain("password='secret'");
    expect(JSON.stringify(db.query.mock.calls[0])).toContain('tableHints');
  });
});

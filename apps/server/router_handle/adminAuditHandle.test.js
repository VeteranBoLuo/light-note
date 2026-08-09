import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query } }));

const { getAdminOperationAudits, adminAuditHandleInternals } = await import('./adminAuditHandle.js');

function response() {
  return {
    body: null,
    send(payload) {
      this.body = payload;
      return payload;
    },
  };
}

describe('管理员操作审计查询', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('管理员预览上下文不能读取站长审计', async () => {
    const res = response();
    await getAdminOperationAudits({ user: { role: 'root' }, adminContext: { id: 'ctx-1' }, body: {} }, res);
    expect(res.body).toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });

  it('筛选参数化并解析安全元数据', async () => {
    query
      .mockResolvedValueOnce([
        [
          {
            id: 'audit-1',
            action: 'async_job.retry',
            outcome: 'succeeded',
            metadata: '{"source":"email"}',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ total: 2, succeeded: 1, failed: 0, denied: 1, job_retries: 1 }]]);
    const res = response();
    await getAdminOperationAudits(
      {
        user: { id: 'root-1', role: 'root' },
        body: {
          action: 'async_job.retry',
          outcome: 'succeeded',
          keyword: 'note',
          startDate: '2026-08-01',
          endDate: '2026-08-09',
          currentPage: 1,
          pageSize: 20,
        },
      },
      res,
    );
    expect(res.body).toMatchObject({
      status: 200,
      data: { total: 1, items: [{ metadata: { source: 'email' } }] },
    });
    const [listSql, listParams] = query.mock.calls[0];
    expect(String(listSql)).toContain('a.action = ?');
    expect(String(listSql)).toContain('a.outcome = ?');
    expect(String(listSql)).toContain('a.create_time >= ?');
    expect(listParams).toContain('async_job.retry');
    expect(listParams).toContain('2026-08-09 23:59:59');
    expect(String(listSql)).not.toContain('note');
  });

  it('日期只接受 YYYY-MM-DD', () => {
    expect(adminAuditHandleInternals.safeDate('2026-08-09')).toBe('2026-08-09 00:00:00');
    expect(adminAuditHandleInternals.safeDate('2026-08-09', true)).toBe('2026-08-09 23:59:59');
    expect(adminAuditHandleInternals.safeDate('2026-08-09 OR 1=1')).toBeNull();
  });
});

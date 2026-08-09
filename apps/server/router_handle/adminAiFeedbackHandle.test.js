import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const beginTransaction = vi.fn();
const commit = vi.fn();
const rollback = vi.fn();
const release = vi.fn();
const getConnection = vi.fn(() => ({ query, beginTransaction, commit, rollback, release }));
vi.mock('../db/index.js', () => ({ default: { getConnection } }));

const { updateAdminAiFeedbackTriage } = await import('./adminAiFeedbackHandle.js');

function response() {
  return {
    body: null,
    send(payload) {
      this.body = payload;
      return payload;
    },
  };
}

describe('AI 回答反馈管理员闭环', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    beginTransaction.mockResolvedValue();
    commit.mockResolvedValue();
    rollback.mockResolvedValue();
    release.mockReturnValue();
  });

  it('管理员预览上下文不能代替站长处理反馈', async () => {
    const res = response();
    await updateAdminAiFeedbackTriage(
      { user: { id: 'root-1', role: 'root' }, adminContext: { id: 'ctx-1' }, body: {} },
      res,
    );
    expect(res.body).toMatchObject({ status: 403 });
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('完成反馈必须填写可审计说明', async () => {
    const res = response();
    await updateAdminAiFeedbackTriage(
      {
        user: { id: 'root-1', role: 'root' },
        body: { feedbackId: 'f-1', status: 'actioned', priority: 'high', note: '短' },
      },
      res,
    );
    expect(res.body).toMatchObject({ status: 400 });
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('处理状态与必需审计在同一事务提交', async () => {
    query
      .mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([[{ id: 'feedback-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await updateAdminAiFeedbackTriage(
      {
        user: { id: 'root-1', role: 'root' },
        body: { feedbackId: 'feedback-1', status: 'actioned', priority: 'high', note: '已补充回归样例并修复' },
        requestId: 'request-1',
        ip: '192.168.1.20',
      },
      res,
    );
    expect(res.body).toMatchObject({ status: 200, data: { status: 'actioned', priority: 'high' } });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO admin_ai_feedback_triage'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO admin_operation_audit'))).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('审计不可用时回滚处理状态', async () => {
    query
      .mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([[{ id: 'feedback-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }));
    const res = response();
    await updateAdminAiFeedbackTriage(
      {
        user: { id: 'root-1', role: 'root' },
        body: { feedbackId: 'feedback-1', status: 'investigating', priority: 'normal', note: '' },
      },
      res,
    );
    expect(res.body).toMatchObject({ status: 503 });
    expect(rollback).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query } }));

const { AdminActionError, beginAdminAction, finishAdminAction } = await import('./adminActionExecution.js');

describe('后台高风险动作统一执行器', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue([{ affectedRows: 1 }]);
  });

  it('未登记动作一律阻断', async () => {
    await expect(
      beginAdminAction(
        { user: { id: 'root-1', role: 'root' }, body: { reason: '这是完整的操作原因', confirmed: true } },
        { action: 'unknown.action' },
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_ACTION_UNREGISTERED', status: 500 });
    expect(query).not.toHaveBeenCalled();
  });

  it('高风险动作强制原因和显式确认', async () => {
    const req = { user: { id: 'root-1', role: 'root' }, body: { reason: '短', confirmed: false } };
    await expect(beginAdminAction(req, { action: 'growth.grant_points' })).rejects.toMatchObject({
      code: 'ADMIN_ACTION_REASON_REQUIRED',
    });
    req.body.reason = '补发七月活动奖励';
    await expect(beginAdminAction(req, { action: 'growth.grant_points' })).rejects.toMatchObject({
      code: 'ADMIN_ACTION_CONFIRMATION_REQUIRED',
    });
  });

  it('intent 与 terminal 共享 Request ID 并返回审计回执', async () => {
    const req = {
      user: { id: 'root-1', role: 'root' },
      requestId: 'request-1',
      ip: '10.0.0.8',
      body: { reason: '补发七月活动奖励', confirmed: true },
    };
    const context = await beginAdminAction(req, {
      action: 'growth.grant_points',
      targetId: 'user-1',
      metadata: { points: 20 },
    });
    const receipt = await finishAdminAction(context, { outcome: 'succeeded', metadata: { affectedRows: 1 } });
    expect(receipt.requestId).toBe('request-1');
    expect(receipt.auditId).toMatch(/[0-9a-f-]{36}/u);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toContain('intent');
    expect(query.mock.calls[1][1]).toContain('succeeded');
  });

  it('代管上下文不能执行后台动作', async () => {
    await expect(
      beginAdminAction(
        {
          user: { id: 'root-1', role: 'root' },
          adminContext: { mode: 'maintain' },
          body: { reason: '维护目标账号资料', confirmed: true },
        },
        { action: 'user.update' },
      ),
    ).rejects.toBeInstanceOf(AdminActionError);
  });
});

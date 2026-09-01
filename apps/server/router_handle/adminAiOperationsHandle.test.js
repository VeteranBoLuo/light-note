import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  getAdminAiExecutionDetail: vi.fn(),
  getAdminAiOperationsOverview: vi.fn(),
  queryAdminAiExecutions: vi.fn(),
}));

vi.mock('../util/services/adminAiOperationsService.js', () => serviceMocks);

const { getAdminAiExecutionDetailHandle, getAdminAiOperationsOverviewHandle, queryAdminAiExecutionsHandle } =
  await import('./adminAiOperationsHandle.js');

function response() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('adminAiOperationsHandle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('仅允许 Root 自己的普通管理会话读取运行数据', async () => {
    for (const req of [
      { user: { role: 'user' }, body: {} },
      { user: { role: 'root' }, adminContext: { id: 'preview-1' }, body: {} },
    ]) {
      const res = response();
      await getAdminAiOperationsOverviewHandle(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    }
    expect(serviceMocks.getAdminAiOperationsOverview).not.toHaveBeenCalled();
  });

  it('将总览、列表和低敏详情委托给统一服务', async () => {
    serviceMocks.getAdminAiOperationsOverview.mockResolvedValue({ summary: { executions: 2 } });
    serviceMocks.queryAdminAiExecutions.mockResolvedValue({ items: [], total: 0 });
    serviceMocks.getAdminAiExecutionDetail.mockResolvedValue({ execution: { id: 'execution-1' }, calls: [] });
    const req = { user: { role: 'root' }, body: { executionId: 'execution-1', periodDays: 30 } };

    for (const handler of [
      getAdminAiOperationsOverviewHandle,
      queryAdminAiExecutionsHandle,
      getAdminAiExecutionDetailHandle,
    ]) {
      const res = response();
      await handler(req, res);
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    }
    expect(serviceMocks.getAdminAiOperationsOverview).toHaveBeenCalledWith(req.body);
    expect(serviceMocks.queryAdminAiExecutions).toHaveBeenCalledWith(req.body);
    expect(serviceMocks.getAdminAiExecutionDetail).toHaveBeenCalledWith('execution-1');
  });

  it('只返回稳定错误码，不透传数据库异常原文', async () => {
    serviceMocks.getAdminAiOperationsOverview.mockRejectedValue(
      Object.assign(new Error('password@private-db'), { code: 'AI_OPERATIONS_STORE_UNAVAILABLE', status: 503 }),
    );
    const res = response();
    await getAdminAiOperationsOverviewHandle({ user: { role: 'root' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 503,
        data: { code: 'AI_OPERATIONS_STORE_UNAVAILABLE' },
        msg: 'AI 运行账本暂不可用',
      }),
    );
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('private-db');
  });
});

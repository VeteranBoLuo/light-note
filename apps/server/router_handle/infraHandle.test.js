import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  finish: vi.fn(),
  dashboard: vi.fn(),
  logs: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg = '') => ({ data, status, msg }),
  L: (_req, zh) => zh,
}));
vi.mock('../util/adminActionExecution.js', () => ({
  beginAdminAction: mocks.begin,
  finishAdminAction: mocks.finish,
  adminActionErrorResponse: (error, fallback) => ({ status: error?.status || 500, message: fallback, code: 'FAILED' }),
}));
vi.mock('../util/hostAgentClient.js', () => {
  class HostAgentClientError extends Error {}
  return {
    HostAgentClientError,
    getHostAgentDashboard: mocks.dashboard,
    getHostAgentLogs: mocks.logs,
    executeHostAgentJob: mocks.execute,
  };
});
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: (error) => String(error?.code || 'ERROR') }));

const { executeInfraAction, getInfraDashboard } = await import('./infraHandle.js');

function response() {
  return { send: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.begin.mockResolvedValue({ definition: {}, baseEntry: {}, metadata: {}, intentAuditId: '1' });
  mocks.finish.mockResolvedValue({ auditId: '2' });
  mocks.execute.mockResolvedValue({ receipt: { state: 'succeeded', exitCode: 0, durationMs: 20 }, replayed: false });
});

describe('infraHandle', () => {
  it('仅 Root 普通上下文可读取仪表盘', async () => {
    const denied = response();
    await getInfraDashboard({ user: { id: '1', role: 'user' } }, denied);
    expect(denied.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(mocks.dashboard).not.toHaveBeenCalled();

    mocks.dashboard.mockResolvedValue({ sampledAt: '2026-08-20T00:00:00.000Z' });
    const allowed = response();
    await getInfraDashboard({ user: { id: '1', role: 'root' } }, allowed);
    expect(allowed.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agentStatus: 'online' }) }),
    );
  });

  it('相同幂等键生成稳定 jobId，并在成功后写入终态审计', async () => {
    const req = {
      user: { id: 'root-1', role: 'root' },
      body: {
        action: 'service.restart',
        targetId: 'lightnote-document-worker',
        idempotencyKey: '12345678-1234-1234-1234-123456789012',
        reason: '重启卡住的文档任务处理进程',
        confirmed: true,
      },
    };
    const res = response();
    await executeInfraAction(req, res);
    expect(mocks.begin).toHaveBeenCalledWith(
      req,
      expect.objectContaining({ action: 'infra.service_restart', targetId: 'lightnote-document-worker' }),
    );
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: expect.stringMatching(/^[a-f0-9]{64}$/), action: 'service.restart' }),
    );
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: 'succeeded' }));
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('不允许重启 API 等非白名单目标', async () => {
    const res = response();
    await executeInfraAction(
      {
        user: { id: 'root-1', role: 'root' },
        body: {
          action: 'service.restart',
          targetId: 'lightnote-api',
          idempotencyKey: '12345678-1234-1234-1234-123456789012',
        },
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('拒绝任意命令等额外字段，不进入审计或 Agent', async () => {
    const res = response();
    await executeInfraAction(
      {
        user: { id: 'root-1', role: 'root' },
        body: {
          action: 'nginx.reload',
          targetId: 'nginx',
          idempotencyKey: '12345678-1234-1234-1234-123456789012',
          reason: '重载配置后检查连接',
          confirmed: true,
          command: 'whoami',
        },
      },
      res,
    );

    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('结果未知时明确要求人工核验并保留重放保护', async () => {
    mocks.execute.mockResolvedValue({
      receipt: { state: 'unknown', exitCode: null, durationMs: 0 },
      replayed: true,
    });
    const req = {
      user: { id: 'root-1', role: 'root' },
      body: {
        action: 'nginx.reload',
        targetId: 'nginx',
        idempotencyKey: '12345678-1234-1234-1234-123456789012',
        reason: '重载配置后检查连接',
        confirmed: true,
      },
    };
    const res = response();

    await executeInfraAction(req, res);

    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        msg: expect.stringContaining('人工核验'),
        data: expect.objectContaining({ requiresManualVerification: true, retrySafe: true }),
      }),
    );
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: 'failed' }));
  });
});

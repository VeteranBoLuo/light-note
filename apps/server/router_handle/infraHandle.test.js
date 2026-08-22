import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  finish: vi.fn(),
  dashboard: vi.fn(),
  services: vi.fn(),
  storage: vi.fn(),
  security: vi.fn(),
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
    getHostAgentServices: mocks.services,
    getHostAgentStorage: mocks.storage,
    getHostAgentSecurity: mocks.security,
    getHostAgentLogs: mocks.logs,
    executeHostAgentJob: mocks.execute,
  };
});
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: (error) => String(error?.code || 'ERROR') }));

const { executeInfraAction, getInfraDashboard, getInfraDiagnostics, infraHandleInternals } =
  await import('./infraHandle.js');

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

  it('安全风险由可验证事实派生，未知采集项不会被当作通过', () => {
    const findings = infraHandleInternals.deriveSecurityFindings({
      ssh: {
        available: true,
        port: 51846,
        permitRootLogin: 'yes',
        passwordAuthentication: true,
        publicKeyAuthentication: true,
        successes24h: 2,
        failures24h: 60,
      },
      firewall: { available: false, provider: null, state: 'unknown' },
      fail2ban: { available: true, state: 'disabled' },
      updates: { available: true, pending: 3, security: 1 },
      listeningPorts: [
        { protocol: 'tcp', address: '0.0.0.0', port: 3306, exposure: 'public' },
        { protocol: 'tcp', address: '0.0.0.0', port: 51846, exposure: 'public' },
      ],
    });
    expect(findings.find((item) => item.id === 'ssh-root-login')).toMatchObject({ state: 'fail' });
    expect(findings.find((item) => item.id === 'firewall')).toMatchObject({ state: 'unknown' });
    expect(findings.find((item) => item.id === 'unexpected-public-ports')).toMatchObject({
      state: 'fail',
      severity: 'high',
      evidence: { ports: ['tcp/3306'] },
    });
  });

  it('诊断阈值由后端唯一事实源派生，并返回精确处理入口', () => {
    const report = infraHandleInternals.deriveInfraDiagnostics(
      {
        dashboard: { metrics: { cpu: { percent: 76 }, memory: { percent: 91, usedBytes: 91, totalBytes: 100 } } },
        services: {
          services: [
            { id: 'lightnote-api', state: 'running' },
            { id: 'lightnote-document-worker', state: 'degraded' },
          ],
        },
        storage: {
          mounts: [{ mountPoint: '/', percent: 89, inodePercent: 20, freeBytes: 1024, freeInodes: 20 }],
          io: { busyPercent: 10 },
        },
        security: {
          ssh: {
            available: true,
            port: 22,
            permitRootLogin: 'no',
            passwordAuthentication: false,
            publicKeyAuthentication: true,
            failures24h: 0,
          },
          firewall: { available: true, state: 'enabled' },
          fail2ban: { available: true, state: 'enabled' },
          updates: { available: true, pending: 0, security: 0 },
          listeningPorts: [],
        },
      },
      [
        { domain: 'overview', state: 'available', capturedAt: '2026-08-20T00:00:00.000Z' },
        { domain: 'services', state: 'available', capturedAt: '2026-08-20T00:00:00.000Z' },
        { domain: 'storage', state: 'available', capturedAt: '2026-08-20T00:00:00.000Z' },
        { domain: 'security', state: 'available', capturedAt: '2026-08-20T00:00:00.000Z' },
      ],
    );

    expect(report.status).toBe('critical');
    expect(report.checks.find((item) => item.id === 'system.cpu')).toMatchObject({ state: 'warning' });
    expect(report.checks.find((item) => item.id === 'system.memory')).toMatchObject({ state: 'fail' });
    expect(report.checks.find((item) => item.id === 'storage.capacity')).toMatchObject({ state: 'warning' });
    expect(report.checks.find((item) => item.id === 'services.health')).toMatchObject({
      state: 'fail',
      target: { module: 'services', serviceId: 'lightnote-document-worker' },
    });
  });

  it('可用数据源存在局部采集错误时不会把诊断伪装成全部通过', () => {
    const report = infraHandleInternals.deriveInfraDiagnostics(
      { dashboard: { metrics: {} }, services: { services: [] }, storage: { mounts: [], io: null } },
      [
        {
          domain: 'overview',
          state: 'available',
          capturedAt: '2026-08-20T00:00:00.000Z',
          collectionErrorCount: 2,
        },
        { domain: 'services', state: 'available', capturedAt: null, collectionErrorCount: 0 },
        { domain: 'storage', state: 'available', capturedAt: null, collectionErrorCount: 0 },
        { domain: 'security', state: 'unavailable', capturedAt: null, collectionErrorCount: 0 },
      ],
    );

    expect(report.status).toBe('attention');
    expect(report.checks.find((item) => item.id === 'collection.overview')).toMatchObject({
      state: 'unknown',
      evidence: { count: 2 },
    });
    expect(report.checks.find((item) => item.id === 'services.health')).toMatchObject({ state: 'unknown' });
  });

  it('诊断允许局部采集失败，失败域明确标为未知且不泄露原始错误', async () => {
    mocks.dashboard.mockResolvedValue({ sampledAt: '2026-08-20T00:00:00.000Z', metrics: {} });
    mocks.services.mockRejectedValue(Object.assign(new Error('secret socket path'), { code: 'HOST_AGENT_TIMEOUT' }));
    mocks.storage.mockResolvedValue({ capturedAt: '2026-08-20T00:00:00.000Z', mounts: [], io: null });
    mocks.security.mockRejectedValue(new Error('private details'));
    const res = response();

    await getInfraDiagnostics({ user: { id: '1', role: 'root' }, query: {} }, res);

    const payload = res.send.mock.calls[0][0];
    expect(payload.status).toBe(200);
    expect(payload.data.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: 'services', state: 'unavailable', code: 'HOST_AGENT_TIMEOUT' }),
        expect.objectContaining({ domain: 'security', state: 'unavailable', code: 'HOST_AGENT_REQUEST_FAILED' }),
      ]),
    );
    expect(payload.data.checks.find((item) => item.id === 'services.health')).toMatchObject({ state: 'unknown' });
    expect(JSON.stringify(payload)).not.toContain('secret socket path');
    expect(JSON.stringify(payload)).not.toContain('private details');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiBaseGet = vi.fn();
const apiBasePost = vi.fn();

vi.mock('@/http/request', () => ({ apiBaseGet, apiBasePost }));

const { executeInfraAction, getInfraDashboard, getInfraLogs, getInfraSecurity, InfraApiError } =
  await import('./infraApi');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('infraApi 状态信封', () => {
  it('仪表盘和日志不会把非 200 业务状态当作成功数据', async () => {
    apiBaseGet.mockResolvedValueOnce({ status: 403, msg: '无权限', data: null }).mockResolvedValueOnce({
      status: 503,
      msg: '日志暂时不可用',
      data: { code: 'HOST_AGENT_LOG_READ_FAILED' },
    });

    await expect(getInfraDashboard()).rejects.toMatchObject({ name: 'InfraApiError', status: 403 });
    await expect(getInfraLogs('nginx')).rejects.toMatchObject({
      name: 'InfraApiError',
      status: 503,
      code: 'HOST_AGENT_LOG_READ_FAILED',
    });
  });

  it('操作失败时保留权威回执，供调用方判断是否可换新幂等键', async () => {
    apiBasePost.mockResolvedValue({
      status: 500,
      msg: '操作未成功',
      data: { receipt: { state: 'failed', exitCode: 1 }, retrySafe: true },
    });

    const request = executeInfraAction({
      action: 'nginx.reload',
      targetId: 'nginx',
      idempotencyKey: '12345678-1234-1234-1234-123456789012',
      reason: '修复配置后重载验证',
      confirmed: true,
    });

    const error = await request.catch((value) => value);
    expect(error).toBeInstanceOf(InfraApiError);
    expect(error).toMatchObject({ data: { receipt: { state: 'failed' } } });
  });

  it('分域快照沿用统一错误信封，不把 Agent 离线当成空安全数据', async () => {
    apiBaseGet.mockResolvedValue({ status: 503, msg: '安全快照暂时不可用', data: { code: 'HOST_AGENT_OFFLINE' } });
    await expect(getInfraSecurity()).rejects.toMatchObject({
      name: 'InfraApiError',
      status: 503,
      code: 'HOST_AGENT_OFFLINE',
    });
  });
});

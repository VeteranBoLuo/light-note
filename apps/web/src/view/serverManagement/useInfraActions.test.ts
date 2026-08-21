import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeInfraAction = vi.fn();
vi.mock('@/api/infraApi', () => ({ executeInfraAction }));

const { infraActionRuntime, useInfraActions } = await import('./useInfraActions');
const confirmation = { reason: '发布后重载配置', confirmed: true as const, confirmText: '确认执行' };

describe('服务器固定运维动作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('结果不确定时重试沿用幂等键，成功后才清除并刷新服务快照', async () => {
    const refresh = vi.fn();
    executeInfraAction.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ status: 200 });
    const runtime = useInfraActions(refresh);

    await expect(runtime.runAction('nginx.reload', 'nginx', confirmation)).rejects.toThrow('temporary failure');
    await expect(runtime.runAction('nginx.reload', 'nginx', confirmation)).resolves.toMatchObject({ status: 200 });

    const firstKey = executeInfraAction.mock.calls[0][0].idempotencyKey;
    expect(executeInfraAction.mock.calls[1][0].idempotencyKey).toBe(firstKey);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(`${infraActionRuntime.ACTION_KEY_STORAGE_PREFIX}nginx.reload:nginx`)).toBeNull();
  });

  it('收到权威失败终态后为新尝试更换幂等键', async () => {
    executeInfraAction
      .mockRejectedValueOnce(Object.assign(new Error('failed'), { data: { receipt: { state: 'failed' } } }))
      .mockResolvedValueOnce({ status: 200 });
    const runtime = useInfraActions(vi.fn());

    await expect(runtime.runAction('nginx.reload', 'nginx', confirmation)).rejects.toThrow('failed');
    await runtime.runAction('nginx.reload', 'nginx', confirmation);

    expect(executeInfraAction.mock.calls[1][0].idempotencyKey).not.toBe(
      executeInfraAction.mock.calls[0][0].idempotencyKey,
    );
  });

  it('页面刷新后仍复用未决动作的幂等键', async () => {
    executeInfraAction.mockRejectedValueOnce(new Error('network interrupted')).mockResolvedValueOnce({ status: 200 });
    const firstRuntime = useInfraActions(vi.fn());
    await expect(firstRuntime.runAction('nginx.reload', 'nginx', confirmation)).rejects.toThrow('network interrupted');
    const firstKey = executeInfraAction.mock.calls[0][0].idempotencyKey;

    const remountedRuntime = useInfraActions(vi.fn());
    await remountedRuntime.runAction('nginx.reload', 'nginx', confirmation);

    expect(executeInfraAction.mock.calls[1][0].idempotencyKey).toBe(firstKey);
  });
});

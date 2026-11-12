import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query } }));

// 使用真实的内部设备过滤，覆盖调用点上的完整判定。
const { refreshLogExclude } = await import('./logExclude.js');
const { recordServerOperation } = await import('./operationLog.js');

const INTERNAL_DEVICE = '7f0c2a4e-5b1d-4c2e-9a3f-1d2e3f4a5b6c';

describe('recordServerOperation', () => {
  beforeEach(async () => {
    mocks.query.mockReset().mockResolvedValueOnce([[{ device_id: INTERNAL_DEVICE }]]);
    await refreshLogExclude();
    mocks.query.mockReset().mockResolvedValue([{}]);
  });

  it('在业务成功后写入当前用户操作日志并剥离四字节字符', async () => {
    const written = await recordServerOperation(
      { user: { id: 'user-1' }, ip: '203.0.113.8', headers: {} },
      { module: '账号安全', operation: '修改密码成功🎉' },
    );

    expect(written).toBe(true);
    expect(mocks.query).toHaveBeenCalledOnce();
    const [, [payload]] = mocks.query.mock.calls[0];
    expect(payload).toMatchObject({
      module: '账号安全',
      operation: '修改密码成功',
      create_by: 'user-1',
      ip: '203.0.113.8',
      del_flag: 0,
    });
  });

  it('本地回环流量不落库', async () => {
    const written = await recordServerOperation(
      { user: { id: 'user-1' }, ip: '127.0.0.1', headers: {} },
      { module: '账号安全', operation: '下线设备成功' },
    );

    expect(written).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('内部设备上的未登录流量不落库', async () => {
    const written = await recordServerOperation(
      {
        user: { id: 'visitor-1', role: 'visitor', isAuthenticated: false },
        ip: '203.0.113.8',
        headers: { 'x-log-device-id': INTERNAL_DEVICE },
      },
      { module: '账号安全', operation: '邮箱验证码重置密码成功', userId: 'root-1' },
    );

    expect(written).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('内部账号登录态即使在内部设备上也照常落库，由查询时隐藏', async () => {
    const written = await recordServerOperation(
      {
        user: { id: 'root-1', role: 'root', isAuthenticated: true },
        ip: '203.0.113.8',
        headers: { 'x-log-device-id': INTERNAL_DEVICE },
      },
      { module: '账号安全', operation: '下线设备成功' },
    );

    expect(written).toBe(true);
    const [, [payload]] = mocks.query.mock.calls[0];
    expect(payload.create_by).toBe('root-1');
  });

  it('普通管理员只读预览不写入被预览用户日志', async () => {
    const written = await recordServerOperation(
      {
        isAdminPreview: true,
        isVisitorWorkspace: false,
        adminActor: { id: 'admin-1', role: 'admin' },
        user: { id: 'target-1' },
      },
      { module: '账号安全', operation: '修改密码成功' },
    );

    expect(written).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('未登录找回密码可显式归属到实际账号', async () => {
    const written = await recordServerOperation(
      { ip: '203.0.113.9', headers: {} },
      { module: '账号安全', operation: '邮箱验证码重置密码成功', userId: 'resolved-user' },
    );

    expect(written).toBe(true);
    const [, [payload]] = mocks.query.mock.calls[0];
    expect(payload.create_by).toBe('resolved-user');
  });
});

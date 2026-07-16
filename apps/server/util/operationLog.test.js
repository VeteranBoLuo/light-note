import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  isSelfTraffic: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query } }));
vi.mock('./logExclude.js', () => ({ isSelfTraffic: mocks.isSelfTraffic }));

const { recordServerOperation } = await import('./operationLog.js');

describe('recordServerOperation', () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue([{}]);
    mocks.isSelfTraffic.mockReset().mockReturnValue(false);
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

  it('日志白名单流量不落库', async () => {
    mocks.isSelfTraffic.mockReturnValue(true);

    const written = await recordServerOperation(
      { user: { id: 'user-1' }, ip: '203.0.113.8', headers: {} },
      { module: '账号安全', operation: '下线设备成功' },
    );

    expect(written).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
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

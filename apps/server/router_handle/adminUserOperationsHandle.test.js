import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  removeUserSessions: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('../util/sessionStore.js', () => ({ removeUserSessions: mocks.removeUserSessions }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));

const { disableAdminUser, restoreAdminUser, updateAdminUser } = await import('./adminUserOperationsHandle.js');

function response() {
  return { send: vi.fn() };
}

function rootRequest(body) {
  return {
    user: { id: 'root-1', role: 'root' },
    requestId: 'request-admin-user',
    ip: '10.0.0.8',
    body,
  };
}

function connectionWith(user) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('SELECT id, alias')) return [[user]];
      if (statement.includes('SELECT id, role')) return [[user]];
      return [{ affectedRows: 1 }];
    }),
  };
  mocks.getConnection.mockResolvedValue(connection);
  return connection;
}

describe('后台用户高风险操作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([{ affectedRows: 1 }]);
    mocks.removeUserSessions.mockResolvedValue(undefined);
  });

  it('普通用户不能调用后台专用更新接口', async () => {
    const res = response();
    await updateAdminUser(
      {
        user: { id: 'user-1', role: 'user' },
        body: { userId: 'user-2', alias: '新昵称', email: 'new@example.com', role: 'user' },
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('修改资料与 terminal 审计在同一事务并返回回执', async () => {
    const connection = connectionWith({
      id: 'user-1',
      alias: '旧昵称',
      email: 'old@example.com',
      role: 'user',
      del_flag: 0,
    });
    const res = response();
    await updateAdminUser(
      rootRequest({
        userId: 'user-1',
        alias: '新昵称',
        email: 'new@example.com',
        role: 'test',
        reason: '测试账号角色调整',
        confirmed: true,
        confirmText: '确认修改用户',
      }),
      res,
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledWith('UPDATE user SET alias = ?, email = ?, role = ? WHERE id = ?', [
      '新昵称',
      'new@example.com',
      'test',
      'user-1',
    ]);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('admin_operation_audit'))).toBe(true);
    expect(res.send.mock.calls[0][0].data).toMatchObject({ affectedRows: 1, requestId: 'request-admin-user' });
  });

  it('禁止从用户管理提升 Root', async () => {
    const connection = connectionWith({ id: 'user-1', alias: '用户', email: 'u@example.com', role: 'user', del_flag: 0 });
    const res = response();
    await updateAdminUser(
      rootRequest({
        userId: 'user-1',
        alias: '用户',
        email: 'u@example.com',
        role: 'root',
        reason: '提升后台管理权限',
        confirmed: true,
        confirmText: '确认修改用户',
      }),
      res,
    );
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
  });

  it('英文界面只能使用登记过的英文确认短语', async () => {
    const connection = connectionWith({
      id: 'user-1',
      alias: 'Old alias',
      email: 'old@example.com',
      role: 'user',
      del_flag: 0,
    });
    const res = response();
    await updateAdminUser(
      rootRequest({
        userId: 'user-1',
        alias: 'New alias',
        email: 'old@example.com',
        role: 'user',
        reason: 'Correcting the public alias',
        confirmed: true,
        confirmText: 'CONFIRM USER UPDATE',
      }),
      res,
    );

    expect(connection.commit).toHaveBeenCalledOnce();
    expect(res.send.mock.calls[0][0]).toMatchObject({ status: 200 });
  });

  it('停用用户后撤销会话，恢复用户复用同一审计护栏', async () => {
    const disabledConnection = connectionWith({ id: 'user-1', role: 'user', del_flag: 0 });
    const disableRes = response();
    await disableAdminUser(
      rootRequest({
        userId: 'user-1',
        reason: '处理账号异常访问',
        confirmed: true,
        confirmText: '确认停用用户',
      }),
      disableRes,
    );
    expect(disabledConnection.commit).toHaveBeenCalledOnce();
    expect(mocks.removeUserSessions).toHaveBeenCalledWith('user-1');
    expect(disableRes.send.mock.calls[0][0].data.status).toBe('disabled');

    const restoredConnection = connectionWith({ id: 'user-1', role: 'user', del_flag: 1 });
    const restoreRes = response();
    await restoreAdminUser(
      rootRequest({
        userId: 'user-1',
        reason: '账号复核通过恢复',
        confirmed: true,
        confirmText: '确认恢复用户',
      }),
      restoreRes,
    );
    expect(restoredConnection.commit).toHaveBeenCalledOnce();
    expect(restoreRes.send.mock.calls[0][0].data.status).toBe('active');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const getConnection = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn((...args) => query(...args)),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const seedNewUserWorkspaceData = vi.fn();
const seedNewUserCloudFile = vi.fn();
const createNotification = vi.fn();
const issueLoginSession = vi.fn();
const recordConversionEvent = vi.fn();
const completeGrowthTask = vi.fn();
const ensureCommunityChatIdentity = vi.fn();
const verifyPassword = vi.fn();
const hashPassword = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query, getConnection } }));
vi.mock('../util/services/newUserSeedService.js', () => ({
  seedNewUserWorkspaceData,
  seedNewUserCloudFile,
}));
vi.mock('../util/notification.js', () => ({ createNotification }));
vi.mock('../util/password.js', () => ({
  verifyPassword,
  hashPassword,
  validatePassword: vi.fn(() => ({ ok: true, msg: '' })),
}));
vi.mock('../util/auth.js', () => ({
  issueLoginSession,
  logoutCurrentSession: vi.fn(),
  ensureNotVisitor: vi.fn(() => true),
  getRequestSid: vi.fn(() => ''),
}));
vi.mock('../util/conversion.js', () => ({
  recordConversionEvent,
  recordFirstOwnResource: vi.fn(),
  normalizeConversionSource: vi.fn((source) => source || 'unknown'),
}));
vi.mock('../util/growthTaskCompletion.js', () => ({ completeGrowthTask }));
vi.mock('../util/services/communityChatIdentityService.js', () => ({ ensureCommunityChatIdentity }));
vi.mock('../util/logExclude.js', () => ({
  isSelfTraffic: vi.fn(() => true),
  listLogExclude: vi.fn(),
  addLogExclude: vi.fn(),
  removeLogExclude: vi.fn(),
}));

// common.js↔router↔handler 循环依赖：先加载 common.js，与现有 handler 测试保持一致。
await import('../util/common.js');
const { handleUserDatabaseOperation, registerUser, saveUserInfo } = await import('./userHandle.js');

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}

function compactSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

describe('新用户示例数据接入注册流程', () => {
  beforeEach(() => {
    query.mockReset();
    getConnection.mockReset();
    connection.beginTransaction.mockReset();
    connection.query.mockClear();
    connection.commit.mockReset();
    connection.rollback.mockReset();
    connection.release.mockReset();
    getConnection.mockResolvedValue(connection);
    seedNewUserWorkspaceData.mockReset();
    seedNewUserCloudFile.mockReset();
    createNotification.mockReset();
    issueLoginSession.mockReset();
    recordConversionEvent.mockReset();
    completeGrowthTask.mockReset();
    ensureCommunityChatIdentity.mockReset();
    verifyPassword.mockReset();
    hashPassword.mockReset();
    verifyPassword.mockReturnValue(false);
    hashPassword.mockReturnValue('hashed-password');
    completeGrowthTask.mockResolvedValue({ completed: true });
    ensureCommunityChatIdentity.mockResolvedValue({
      userPublicId: '11111111-1111-4111-8111-111111111111',
      communityId: 'ln_TEST22',
    });
    seedNewUserWorkspaceData.mockResolvedValue({ created: true, folderId: 42 });
    seedNewUserCloudFile.mockResolvedValue({ created: true, id: 7, folderId: 42 });
    createNotification.mockResolvedValue(undefined);
    issueLoginSession.mockResolvedValue('sid-1');
  });

  it('邮箱首次注册会同步初始化数据库示例，并按 X-Lang 异步创建云文件', async () => {
    let insertedUser;
    query.mockImplementation(async (sql, params) => {
      const text = compactSql(sql);
      if (text === 'SELECT * FROM user WHERE email = ?') return [[]];
      if (text === 'INSERT INTO user SET ?') {
        insertedUser = params[0];
        return [{ affectedRows: 1 }];
      }
      if (text.includes('FROM user u') && text.endsWith('WHERE u.id = ?')) {
        return [[{ id: params[0], email: insertedUser.email, alias: insertedUser.alias, role: 'user' }]];
      }
      return [[]];
    });
    const req = {
      headers: { 'x-lang': 'en-US' },
      body: {
        email: 'new@example.com',
        password: 'secret123',
        signupSource: 'nav',
      },
    };
    const res = mockRes();

    await registerUser(req, res);

    expect(ensureCommunityChatIdentity).toHaveBeenCalledWith({ userId: insertedUser.id });
    expect(seedNewUserWorkspaceData).toHaveBeenCalledWith({ userId: insertedUser.id, lang: 'en-US' });
    expect(seedNewUserCloudFile).toHaveBeenCalledWith({
      userId: insertedUser.id,
      lang: 'en-US',
      folderId: 42,
    });
    expect(completeGrowthTask).not.toHaveBeenCalled();
    expect(seedNewUserWorkspaceData.mock.invocationCallOrder[0]).toBeLessThan(
      issueLoginSession.mock.invocationCallOrder[0],
    );
    expect(createNotification).toHaveBeenCalledWith(
      insertedUser.id,
      expect.objectContaining({
        type: 'welcome',
        title: 'Welcome to Light Note 🎉',
        content: expect.stringContaining('editable examples'),
      }),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({ id: insertedUser.id, sid: 'sid-1' }),
      }),
    );
  });

  it('数据库示例初始化失败不会让邮箱注册失败，也不会创建孤立云文件', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedNewUserWorkspaceData.mockRejectedValue(
      Object.assign(new Error('seed failed'), { code: 'NEW_USER_SEED_FAILED' }),
    );
    let insertedUser;
    query.mockImplementation(async (sql, params) => {
      const text = compactSql(sql);
      if (text === 'SELECT * FROM user WHERE email = ?') return [[]];
      if (text === 'INSERT INTO user SET ?') {
        insertedUser = params[0];
        return [{ affectedRows: 1 }];
      }
      if (text.includes('FROM user u') && text.endsWith('WHERE u.id = ?')) {
        return [[{ id: params[0], email: insertedUser.email, alias: insertedUser.alias, role: 'user' }]];
      }
      return [[]];
    });
    const res = mockRes();

    await registerUser(
      {
        headers: { 'x-lang': 'zh-CN' },
        body: { email: 'new@example.com', password: 'secret123', signupSource: 'nav' },
      },
      res,
    );

    expect(seedNewUserCloudFile).not.toHaveBeenCalled();
    expect(completeGrowthTask).not.toHaveBeenCalled();
    expect(issueLoginSession).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    expect(createNotification).toHaveBeenCalledWith(
      insertedUser.id,
      expect.objectContaining({
        content: expect.stringContaining('从第一条内容开始整理'),
      }),
    );
    expect(warn).toHaveBeenCalledWith('[register] 示例数据初始化失败 code=%s', 'NEW_USER_SEED_FAILED');
    warn.mockRestore();
  });

  it('保存真实头像会先同步成长任务达成状态，再返回成功', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await saveUserInfo(
      {
        user: { id: 'user-1', role: 'user' },
        body: { id: 'user-1', alias: '新用户', email: 'new@example.com', headPicture: 'data:image/png;base64,abc' },
      },
      res,
    );

    expect(query).toHaveBeenCalledWith('update user set ? where id=?', [
      expect.objectContaining({ head_picture: 'data:image/png;base64,abc' }),
      'user-1',
    ]);
    expect(completeGrowthTask).toHaveBeenCalledWith('user-1', 'profile_avatar', { userRole: 'user' });
    expect(completeGrowthTask.mock.invocationCallOrder[0]).toBeLessThan(res.send.mock.invocationCallOrder[0]);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('root 保存头像也同步任务事实，由成长服务自动收口且不发奖励', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await saveUserInfo(
      {
        user: { id: 'root-1', role: 'root' },
        body: { id: 'root-1', alias: '站长', email: 'root@example.com', headPicture: 'avatar-data' },
      },
      res,
    );

    expect(query).toHaveBeenCalledWith('update user set ? where id=?', [
      expect.objectContaining({ head_picture: 'avatar-data' }),
      'root-1',
    ]);
    expect(completeGrowthTask).toHaveBeenCalledWith('root-1', 'profile_avatar', { userRole: 'root' });
    expect(completeGrowthTask.mock.invocationCallOrder[0]).toBeLessThan(res.send.mock.invocationCallOrder[0]);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('GitHub 仅在首次建号时初始化示例数据', async () => {
    let createdUserId = '';
    query.mockImplementation(async (sql, params) => {
      const text = compactSql(sql);
      if (text === 'SELECT * FROM user WHERE github_id = ? LIMIT 1 FOR UPDATE' && !createdUserId) return [[]];
      if (text === 'SELECT * FROM user WHERE email = ? LIMIT 1 FOR UPDATE') return [[]];
      if (text.startsWith('INSERT INTO user')) {
        createdUserId = params[0];
        return [{ affectedRows: 1 }];
      }
      if (text === 'SELECT * FROM user WHERE id = ? LIMIT 1') {
        return [[{ id: createdUserId, alias: 'octo', role: 'user' }]];
      }
      return [[]];
    });

    const user = await handleUserDatabaseOperation(
      {
        id: 123,
        login: 'octo',
        email: 'octo@example.com',
        avatar_url: 'https://avatars.example.com/octo.png',
      },
      { headers: { 'x-lang': 'en-US' }, body: { signupSource: 'nav' } },
    );

    expect(user.id).toBe(createdUserId);
    expect(ensureCommunityChatIdentity).toHaveBeenCalledWith({ userId: createdUserId });
    expect(seedNewUserWorkspaceData).toHaveBeenCalledWith({ userId: createdUserId, lang: 'en-US' });
    expect(seedNewUserCloudFile).toHaveBeenCalledWith({
      userId: createdUserId,
      lang: 'en-US',
      folderId: 42,
    });
    expect(completeGrowthTask).toHaveBeenCalledWith(createdUserId, 'profile_avatar', { userRole: 'user' });
  });

  it('GitHub 已有账号登录时不重复初始化', async () => {
    query.mockResolvedValueOnce([[{ id: 'existing-user', alias: 'octo', role: 'user' }]]);

    const user = await handleUserDatabaseOperation(
      { id: 123, login: 'octo', email: 'octo@example.com', avatar_url: '' },
      { headers: { 'x-lang': 'zh-CN' }, body: {} },
    );

    expect(user.id).toBe('existing-user');
    expect(ensureCommunityChatIdentity).not.toHaveBeenCalled();
    expect(seedNewUserWorkspaceData).not.toHaveBeenCalled();
    expect(seedNewUserCloudFile).not.toHaveBeenCalled();
  });

  it('历史 GitHub 固定初始密码在再次完成 GitHub 认证后自动轮换', async () => {
    verifyPassword.mockReturnValue(true);
    query
      .mockResolvedValueOnce([
        [{ id: 'legacy-user', alias: 'octo', role: 'user', login_type: 'github', password: 'legacy-hash' }],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const user = await handleUserDatabaseOperation(
      { id: 123, login: 'octo', email: 'octo@example.com', avatar_url: '' },
      { headers: { 'x-lang': 'zh-CN' }, body: {} },
    );

    expect(verifyPassword).toHaveBeenCalledWith('123456', 'legacy-hash');
    expect(query).toHaveBeenCalledWith("UPDATE user SET password = ?, password_method = 'scrypt' WHERE id = ?", [
      'hashed-password',
      'legacy-user',
    ]);
    expect(user.password).toBe('hashed-password');
  });

  it('GitHub 按邮箱绑定已有账号时不把它误判成新用户', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 'email-user', email: 'octo@example.com', role: 'user' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 'email-user', alias: 'octo', role: 'user', login_type: 'github' }]]);

    const user = await handleUserDatabaseOperation(
      { id: 123, login: 'octo', email: 'octo@example.com', avatar_url: '' },
      { headers: { 'x-lang': 'zh-CN' }, body: {} },
    );

    expect(user.id).toBe('email-user');
    expect(seedNewUserWorkspaceData).not.toHaveBeenCalled();
    expect(seedNewUserCloudFile).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      "UPDATE user SET github_id = ?, login_type = 'github' WHERE id = ? AND (github_id IS NULL OR github_id = ?)",
      ['123', 'email-user', '123'],
    );
  });

  it('同一邮箱已绑定其他 GitHub 账号时拒绝静默覆盖', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 'email-user', email: 'octo@example.com', github_id: '999', role: 'user' }]]);

    await expect(
      handleUserDatabaseOperation(
        { id: 123, login: 'octo', email: 'octo@example.com', avatar_url: '' },
        { headers: { 'x-lang': 'zh-CN' }, body: {} },
      ),
    ).rejects.toMatchObject({ code: 'GITHUB_OAUTH_EMAIL_CONFLICT', status: 409 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE user SET github_id'), expect.anything());
  });

  it('首次注册唯一键并发冲突时释放连接并幂等读取已创建账号', async () => {
    let transactionAttempt = 0;
    connection.beginTransaction.mockImplementation(async () => {
      transactionAttempt += 1;
    });
    query.mockImplementation(async (sql) => {
      const text = compactSql(sql);
      if (text === 'SELECT * FROM user WHERE github_id = ? LIMIT 1 FOR UPDATE') {
        return transactionAttempt === 1 ? [[]] : [[{ id: 'winner-user', github_id: '123', role: 'user' }]];
      }
      if (text === 'SELECT * FROM user WHERE email = ? LIMIT 1 FOR UPDATE') return [[]];
      if (text.startsWith('INSERT INTO user')) {
        throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      }
      return [[]];
    });

    await expect(
      handleUserDatabaseOperation(
        { id: 123, login: 'octo', email: 'octo@example.com', avatar_url: '' },
        { headers: { 'x-lang': 'zh-CN' }, body: {} },
      ),
    ).resolves.toMatchObject({ id: 'winner-user' });
    expect(getConnection).toHaveBeenCalledTimes(2);
    expect(connection.release).toHaveBeenCalledTimes(2);
    expect(seedNewUserWorkspaceData).not.toHaveBeenCalled();
  });
});

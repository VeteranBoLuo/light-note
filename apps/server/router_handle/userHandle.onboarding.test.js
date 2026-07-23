import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const seedNewUserWorkspaceData = vi.fn();
const seedNewUserCloudFile = vi.fn();
const createNotification = vi.fn();
const issueLoginSession = vi.fn();
const recordConversionEvent = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query, getConnection: vi.fn() } }));
vi.mock('../util/services/newUserSeedService.js', () => ({
  seedNewUserWorkspaceData,
  seedNewUserCloudFile,
}));
vi.mock('../util/notification.js', () => ({ createNotification }));
vi.mock('../util/password.js', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(() => 'hashed-password'),
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
vi.mock('../util/logExclude.js', () => ({
  isSelfTraffic: vi.fn(() => true),
  listLogExclude: vi.fn(),
  addLogExclude: vi.fn(),
  removeLogExclude: vi.fn(),
}));

// common.js↔router↔handler 循环依赖：先加载 common.js，与现有 handler 测试保持一致。
await import('../util/common.js');
const { handleUserDatabaseOperation, registerUser } = await import('./userHandle.js');

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
    seedNewUserWorkspaceData.mockReset();
    seedNewUserCloudFile.mockReset();
    createNotification.mockReset();
    issueLoginSession.mockReset();
    recordConversionEvent.mockReset();
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

    expect(seedNewUserWorkspaceData).toHaveBeenCalledWith({ userId: insertedUser.id, lang: 'en-US' });
    expect(seedNewUserCloudFile).toHaveBeenCalledWith({
      userId: insertedUser.id,
      lang: 'en-US',
      folderId: 42,
    });
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

  it('GitHub 仅在首次建号时初始化示例数据', async () => {
    let createdUserId = '';
    query.mockImplementation(async (sql, params) => {
      const text = compactSql(sql);
      if (text === 'SELECT * FROM user WHERE github_id = ? LIMIT 1' && !createdUserId) return [[]];
      if (text === 'SELECT * FROM user WHERE email = ? LIMIT 1') return [[]];
      if (text.startsWith('INSERT INTO user')) {
        createdUserId = params[0];
        return [{ affectedRows: 1 }];
      }
      if (text === 'SELECT * FROM user WHERE github_id = ? LIMIT 1') {
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
    expect(seedNewUserWorkspaceData).toHaveBeenCalledWith({ userId: createdUserId, lang: 'en-US' });
    expect(seedNewUserCloudFile).toHaveBeenCalledWith({
      userId: createdUserId,
      lang: 'en-US',
      folderId: 42,
    });
  });

  it('GitHub 已有账号登录时不重复初始化', async () => {
    query.mockResolvedValueOnce([[{ id: 'existing-user', alias: 'octo', role: 'user' }]]);

    const user = await handleUserDatabaseOperation(
      { id: 123, login: 'octo', email: 'octo@example.com', avatar_url: '' },
      { headers: { 'x-lang': 'zh-CN' }, body: {} },
    );

    expect(user.id).toBe('existing-user');
    expect(seedNewUserWorkspaceData).not.toHaveBeenCalled();
    expect(seedNewUserCloudFile).not.toHaveBeenCalled();
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
    expect(query).toHaveBeenCalledWith("UPDATE user SET github_id = ?, login_type = 'github' WHERE id = ?", [
      123,
      'email-user',
    ]);
  });
});

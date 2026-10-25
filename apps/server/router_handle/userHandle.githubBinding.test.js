import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  values: new Map(),
  query: vi.fn(),
  getConnection: vi.fn(),
  issue: vi.fn(),
  api: vi.fn(),
  token: vi.fn(),
  audit: vi.fn(),
  loseCompletionReply: false,
  failNextRead: false,
}));
vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('../util/redisClient.js', () => ({
  default: {
    get: vi.fn(async (key) => {
      if (mocks.failNextRead) {
        mocks.failNextRead = false;
        throw new Error('Redis read unavailable');
      }
      return mocks.values.get(key) || null;
    }),
    setEx: vi.fn(async (key, _ttl, value) => {
      mocks.values.set(key, value);
      return 'OK';
    }),
    eval: vi.fn(async (_script, { keys, arguments: args }) => {
      const current = mocks.values.get(keys[0]);
      if (!current || current !== args[0]) return current || null;
      mocks.values.set(keys[0], args[1]);
      if (mocks.loseCompletionReply && JSON.parse(args[1]).status === 'completed') {
        mocks.loseCompletionReply = false;
        mocks.failNextRead = true;
        throw new Error('Redis completion acknowledgement lost');
      }
      return args[1];
    }),
  },
}));
vi.mock('../util/auth.js', () => ({
  issueLoginSession: mocks.issue,
  ensureNotVisitor: () => true,
  getRequestSid: () => '',
  logoutCurrentSession: vi.fn(),
}));
vi.mock('../util/githubOAuth.js', async (original) => ({
  ...(await original()),
  fetchGitHubApiJson: mocks.api,
  fetchGitHubTokenSafely: mocks.token,
}));
vi.mock('../util/operationLog.js', () => ({ recordServerOperation: mocks.audit }));
await import('../util/common.js');
const { github, bindGithub } = await import('./userHandle.js');
const { createGitHubOAuthChallenge, GITHUB_OAUTH_CONSENT_VERSION } = await import('../util/githubOAuthState.js');
const res = () => ({ send: vi.fn(), clearCookie: vi.fn() });

describe('GitHub 同邮箱提醒后确认绑定', () => {
  let user;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values.clear();
    mocks.loseCompletionReply = false;
    mocks.failNextRead = false;
    vi.stubEnv('GITHUB_CLIENT_ID', 'test-id');
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-secret');
    user = {
      id: 'owner',
      email: 'owner@example.com',
      password: 'original-hash',
      login_password_set: 1,
      login_type: 'email',
      role: 'user',
      del_flag: 0,
      github_id: null,
      alias: 'original',
    };
    mocks.query.mockImplementation(async (sql, params) => {
      if (sql.startsWith('UPDATE user SET github_id')) {
        user.github_id = params[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('WHERE github_id')) return [user.github_id === String(params[0]) ? [{ ...user }] : []];
      if (sql.includes('WHERE email') || sql.includes('WHERE id = ?')) return [[{ ...user }]];
      return [[]];
    });
    mocks.getConnection.mockResolvedValue({
      query: mocks.query,
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
    });
    mocks.issue.mockImplementation(async (_req, _res, _user, _remember, options) => {
      await options?.validateAccount?.({ ...user });
      return 'existing-sid';
    });
    mocks.audit.mockResolvedValue();
    mocks.token.mockResolvedValue({ access_token: 'provider-token' });
    mocks.api.mockImplementation(async (path) =>
      path === '/user'
        ? { id: 123, login: 'octo', avatar_url: '' }
        : [{ email: 'owner@example.com', primary: true, verified: true }],
    );
  });
  afterEach(() => vi.unstubAllEnvs());
  async function callback() {
    const auth = await createGitHubOAuthChallenge({ consentVersion: GITHUB_OAUTH_CONSENT_VERSION });
    const state = new URL(auth.authorizationUrl).searchParams.get('state');
    const req = {
      headers: { cookie: `ln_github_oauth_nonce=${auth.nonce}` },
      body: { state, code: 'provider-code-123' },
    };
    const response = res();
    await github(req, response);
    return { req, response, result: response.send.mock.calls[0][0] };
  }
  it('首次同邮箱只提示，不写关联、密码或会话；确认后仅添加 GitHub 关联并登录', async () => {
    const before = { ...user };
    const ticket = await callback();
    expect(ticket.result).toMatchObject({ status: 409, data: { bindingRequired: true, githubLogin: 'octo' } });
    expect(user).toEqual(before);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
    const response = res();
    await bindGithub(
      { ...ticket.req, body: { state: ticket.req.body.state, confirm: true, userId: 'forged', githubId: '999' } },
      response,
    );
    expect(response.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { sid: 'existing-sid' } });
    expect(user).toEqual({ ...before, github_id: '123' });
    expect(mocks.issue).toHaveBeenCalledOnce();
  });
  it.each([true, false])('没有本次授权与浏览器凭据时 confirm=%s 不能指定账号绑定', async (confirm) => {
    const response = res();
    await bindGithub(
      { headers: {}, body: { confirm, state: 'old-ticket', userId: 'owner', githubId: '123' } },
      response,
    );
    expect(response.send.mock.calls[0][0].status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('回调重放恢复同一个待确认提示，不重放 GitHub 授权码', async () => {
    const ticket = await callback();
    const response = res();
    await github(ticket.req, response);
    expect(response.send.mock.calls[0][0].data.bindingRequired).toBe(true);
    expect(mocks.token).toHaveBeenCalledOnce();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('取消后不能再确认原票据，不产生关联或登录', async () => {
    const ticket = await callback();
    const response = res();
    const req = { ...ticket.req, body: { state: ticket.req.body.state, confirm: false } };
    await bindGithub(req, response);
    expect(response.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { cancelled: true } });
    await bindGithub({ ...req, body: { ...req.body, confirm: true } }, res());
    expect(user.github_id).toBeNull();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('其他浏览器不能确认或消耗票据，原浏览器仍可继续', async () => {
    const ticket = await callback();
    const body = { state: ticket.req.body.state, confirm: true };
    const response = res();
    await bindGithub({ headers: { cookie: `ln_github_oauth_nonce=${'x'.repeat(43)}` }, body }, response);
    expect(response.send.mock.calls[0][0].status).toBe(400);
    expect(user.github_id).toBeNull();
    await bindGithub({ ...ticket.req, body }, res());
    expect(user.github_id).toBe('123');
  });
  it.each([
    { password: 'changed' },
    { email: 'changed@example.com' },
    { github_id: '999' },
    { del_flag: 1 },
    { role: 'visitor' },
  ])('确认前账号变化 %j 拒绝绑定和签发会话', async (patch) => {
    const ticket = await callback();
    Object.assign(user, patch);
    const response = res();
    await bindGithub({ ...ticket.req, body: { state: ticket.req.body.state, confirm: true } }, response);
    expect(response.send.mock.calls[0][0].status).toBe(409);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('重复确认只写一次关联，成功后改密码或解除关联不能凭旧票据恢复登录', async () => {
    const ticket = await callback();
    const req = { ...ticket.req, body: { state: ticket.req.body.state, confirm: true } };
    await bindGithub(req, res());
    await bindGithub(req, res());
    expect(mocks.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE user SET github_id'))).toHaveLength(1);
    expect(mocks.issue).toHaveBeenCalledTimes(2);
    user.github_id = null;
    await bindGithub(req, res());
    expect(mocks.issue).toHaveBeenCalledTimes(2);
  });
  it('读取 GitHub 邮箱超时不降级为占位账号注册', async () => {
    mocks.api.mockImplementation(async (path) => {
      if (path === '/user/emails')
        throw Object.assign(new Error(), { code: 'GITHUB_OAUTH_API_UNAVAILABLE', status: 503, stage: 'PROFILE_FETCH' });
      return { id: 123, login: 'octo' };
    });
    const ticket = await callback();
    expect(ticket.result.status).toBe(503);
    expect(mocks.getConnection).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('已绑定 GitHub ID 登录不依赖邮箱接口可用性', async () => {
    user.github_id = '123';
    mocks.api.mockImplementation(async (path) => {
      if (path === '/user/emails')
        throw Object.assign(new Error(), { code: 'GITHUB_OAUTH_API_UNAVAILABLE', status: 503, stage: 'PROFILE_FETCH' });
      return { id: 123, login: 'octo' };
    });
    const ticket = await callback();
    expect(ticket.result.status).toBe(200);
    expect(mocks.issue).toHaveBeenCalledOnce();
  });
  it('只采用 GitHub 已验证的邮箱，未验证主邮箱不能参与关联', async () => {
    mocks.api.mockImplementation(async (path) =>
      path === '/user'
        ? { id: 123, login: 'octo' }
        : [
            { email: 'unverified@example.com', primary: true, verified: false },
            { email: 'owner@example.com', primary: false, verified: true },
          ],
    );
    const ticket = await callback();
    expect(ticket.result.data.bindingRequired).toBe(true);
    expect(user.github_id).toBeNull();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('绑定成功但会话签发短暂失败时可恢复，无需再次向 GitHub 换票', async () => {
    const ticket = await callback();
    mocks.issue.mockRejectedValueOnce(new Error('temporary session store failure'));
    const req = { ...ticket.req, body: { state: ticket.req.body.state, confirm: true } };
    const failed = res();
    await bindGithub(req, failed);
    expect(failed.send.mock.calls[0][0].data.retryable).toBe(true);
    const recovered = res();
    await bindGithub(req, recovered);
    expect(recovered.send.mock.calls[0][0].status).toBe(200);
    expect(mocks.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE user SET github_id'))).toHaveLength(1);
    expect(mocks.token).toHaveBeenCalledOnce();
  });
  it('完成写入回包与立即复核同时失败时保留 nonce，重试恢复已落库绑定', async () => {
    const ticket = await callback();
    mocks.loseCompletionReply = true;
    const request = { ...ticket.req, body: { state: ticket.req.body.state, confirm: true } };
    const response = res();
    await bindGithub(request, response);
    expect(response.send.mock.calls[0][0]).toMatchObject({ status: 500, data: { retryable: true } });
    expect(response.clearCookie).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
    const retry = res();
    await bindGithub(request, retry);
    expect(retry.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { sid: 'existing-sid' } });
    expect(mocks.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE user SET github_id'))).toHaveLength(1);
    expect(mocks.token).toHaveBeenCalledOnce();
  });
  it('提交换票前线路失败可安全重试本站回调', async () => {
    mocks.token.mockRejectedValueOnce(
      Object.assign(new Error(), { code: 'GITHUB_OAUTH_ROUTE_UNAVAILABLE', status: 503, stage: 'TOKEN_CONNECT' }),
    );
    const ticket = await callback();
    expect(ticket.result.data.retryable).toBe(true);
    const response = res();
    await github(ticket.req, response);
    expect(response.send.mock.calls[0][0].data.bindingRequired).toBe(true);
    expect(mocks.token).toHaveBeenCalledTimes(2);
  });
  it('换票响应未知时不能重放授权码', async () => {
    mocks.token.mockRejectedValueOnce(
      Object.assign(new Error(), { code: 'GITHUB_OAUTH_TOKEN_RESULT_UNKNOWN', status: 503, stage: 'TOKEN_EXCHANGE' }),
    );
    const ticket = await callback();
    expect(ticket.result.data.retryable).toBe(false);
    await github(ticket.req, res());
    expect(mocks.token).toHaveBeenCalledOnce();
  });
  it('已绑定账号仍按 GitHub ID 正常登录，并能恢复成功回调', async () => {
    user.github_id = '123';
    const ticket = await callback();
    expect(ticket.result).toMatchObject({ status: 200, data: { sid: 'existing-sid' } });
    const again = res();
    await github(ticket.req, again);
    expect(again.send.mock.calls[0][0].status).toBe(200);
    expect(mocks.token).toHaveBeenCalledOnce();
    expect(mocks.issue).toHaveBeenCalledTimes(2);
    expect(user.password).toBe('original-hash');
  });
  it.each([
    { password: 'changed' },
    { password_method: 'changed' },
    { github_id: null },
    { role: 'visitor' },
    { del_flag: 1 },
  ])('绑定后签发前账号变化 %j 时不登录，旧票据也不可恢复', async (patch) => {
    const ticket = await callback();
    mocks.issue.mockImplementationOnce(async (_req, _res, _user, _remember, options) => {
      Object.assign(user, patch);
      await options.validateAccount({ ...user });
      return 'must-not-issue';
    });
    const request = { ...ticket.req, body: { state: ticket.req.body.state, confirm: true } };
    const response = res();
    await bindGithub(request, response);
    expect(response.send.mock.calls[0][0]).toMatchObject({
      status: 409,
      data: { code: 'GITHUB_OAUTH_ACCOUNT_CHANGED', retryable: false },
    });
    const recovered = res();
    await bindGithub(request, recovered);
    expect(recovered.send.mock.calls[0][0].status).toBe(409);
  });
  it('已绑定的访客或禁用账号不能签发 GitHub 会话', async () => {
    user.github_id = '123';
    user.role = 'visitor';
    const ticket = await callback();
    expect(ticket.result).toMatchObject({
      status: 409,
      data: { code: 'GITHUB_OAUTH_ACCOUNT_CHANGED', retryable: false },
    });
  });
});

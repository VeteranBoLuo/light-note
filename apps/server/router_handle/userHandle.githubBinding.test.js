import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  values: new Map(),
  query: vi.fn(),
  getConnection: vi.fn(),
  issue: vi.fn(),
  api: vi.fn(),
  token: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('../util/redisClient.js', () => ({
  default: {
    get: vi.fn(async (key) => mocks.values.get(key) || null),
    setEx: vi.fn(async (key, _ttl, value) => {
      mocks.values.set(key, value);
      return 'OK';
    }),
    eval: vi.fn(async (_script, { keys, arguments: args }) => {
      const current = mocks.values.get(keys[0]);
      if (!current || current !== args[0]) return current || null;
      mocks.values.set(keys[0], args[1]);
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

describe('GitHub 同邮箱冲突拒绝匿名绑定', () => {
  let user;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values.clear();
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
    mocks.issue.mockResolvedValue('existing-sid');
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
  it('经 GitHub 验证的同邮箱不能接管预先注册的账号或修改其密码和会话', async () => {
    const before = { ...user };
    const ticket = await callback();
    expect(ticket.result).toMatchObject({
      status: 409,
      data: { code: 'GITHUB_OAUTH_EMAIL_CONFLICT', retryable: false },
    });
    expect(ticket.result.msg).toContain('邮箱登录或找回密码');
    expect(user).toEqual(before);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
  });
  it.each([true, false])('旧匿名确认接口 confirm=%s 无论票据或伪造身份均拒绝', async (confirm) => {
    const response = res();
    await bindGithub(
      { headers: {}, body: { confirm, state: 'old-ticket', userId: 'owner', githubId: '123' } },
      response,
    );
    expect(response.send.mock.calls[0][0]).toMatchObject({
      status: 409,
      data: { code: 'GITHUB_OAUTH_EMAIL_CONFLICT', retryable: false },
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('冲突后的回调重放不换票、不绑定、不签发会话', async () => {
    const ticket = await callback();
    await github(ticket.req, res());
    expect(mocks.token).toHaveBeenCalledOnce();
    expect(mocks.issue).not.toHaveBeenCalled();
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
});

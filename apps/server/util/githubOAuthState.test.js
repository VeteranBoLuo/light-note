import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisValues = new Map();
const redisClient = {
  setEx: vi.fn(async (key, _ttl, value) => {
    redisValues.set(key, value);
    return 'OK';
  }),
  get: vi.fn(async (key) => redisValues.get(key) || null),
  eval: vi.fn(async (_script, { keys, arguments: args }) => {
    const current = redisValues.get(keys[0]) || null;
    if (!current) return null;
    if (current !== args[0]) return current;
    redisValues.set(keys[0], args[1]);
    return args[1];
  }),
};

vi.mock('./redisClient.js', () => ({ default: redisClient }));

const {
  GITHUB_OAUTH_CONSENT_VERSION,
  completeGitHubOAuthChallenge,
  consumeGitHubOAuthChallenge,
  createGitHubOAuthChallenge,
  failGitHubOAuthChallenge,
  readGitHubOAuthNonce,
} = await import('./githubOAuthState.js');

beforeEach(() => {
  vi.clearAllMocks();
  redisValues.clear();
  vi.stubEnv('GITHUB_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-client-secret');
  vi.stubEnv('GITHUB_REDIRECT_URI', 'https://boluo66.top/auth/callback');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GitHub OAuth 单独同意与 state 校验', () => {
  it('只返回授权地址和浏览器 nonce，Redis 保存摘要及同意证据', async () => {
    const result = await createGitHubOAuthChallenge({
      consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
      flow: 'register',
      signupSource: 'landing',
    });
    const url = new URL(result.authorizationUrl);
    const rawChallenge = String(redisClient.setEx.mock.calls[0][2]);
    const challenge = JSON.parse(rawChallenge);

    expect(url.origin).toBe('https://github.com');
    expect(url.pathname).toBe('/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('scope')).toBe('user:email');
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(result.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rawChallenge).not.toContain(result.nonce);
    expect(challenge).toMatchObject({
      consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
      flow: 'register',
      signupSource: 'landing',
    });
    expect(challenge.nonceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge.redirectUri).toBe('https://boluo66.top/auth/callback');
  });

  it('正确的 state 与 HttpOnly cookie nonce 只能认领一次', async () => {
    const challenge = await createGitHubOAuthChallenge({
      consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
      flow: 'login',
    });
    const state = new URL(challenge.authorizationUrl).searchParams.get('state');

    const code = 'github-code-1';
    await expect(consumeGitHubOAuthChallenge({ state, nonce: challenge.nonce, code })).resolves.toMatchObject({
      consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
      flow: 'login',
      recovered: false,
      codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      redirectUri: 'https://boluo66.top/auth/callback',
    });
    await expect(consumeGitHubOAuthChallenge({ state, nonce: challenge.nonce, code })).rejects.toMatchObject({
      code: 'GITHUB_OAUTH_IN_PROGRESS',
    });
  });

  it('nonce 不匹配时拒绝授权，但不会被第三方仅凭 state 烧毁挑战', async () => {
    const challenge = await createGitHubOAuthChallenge({
      consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
    });
    const state = new URL(challenge.authorizationUrl).searchParams.get('state');

    await expect(
      consumeGitHubOAuthChallenge({ state, nonce: 'x'.repeat(43), code: 'github-code-2' }),
    ).rejects.toMatchObject({
      code: 'GITHUB_OAUTH_STATE_INVALID',
    });
    expect(redisValues.size).toBe(1);
  });

  it('完成后的重复回调恢复 userId，不会再次换取 GitHub token', async () => {
    const challenge = await createGitHubOAuthChallenge({ consentVersion: GITHUB_OAUTH_CONSENT_VERSION });
    const state = new URL(challenge.authorizationUrl).searchParams.get('state');
    const code = 'github-code-completed';

    await consumeGitHubOAuthChallenge({ state, nonce: challenge.nonce, code });
    await expect(completeGitHubOAuthChallenge({ state, code, userId: 'user-1' })).resolves.toBe(true);
    await expect(consumeGitHubOAuthChallenge({ state, nonce: challenge.nonce, code })).resolves.toMatchObject({
      recovered: true,
      userId: 'user-1',
    });
  });

  it('换票或下游失败后要求重新发起授权', async () => {
    const challenge = await createGitHubOAuthChallenge({ consentVersion: GITHUB_OAUTH_CONSENT_VERSION });
    const state = new URL(challenge.authorizationUrl).searchParams.get('state');
    const code = 'github-code-failed';

    await consumeGitHubOAuthChallenge({ state, nonce: challenge.nonce, code });
    await expect(
      failGitHubOAuthChallenge({ state, code, errorCode: 'GITHUB_OAUTH_TOKEN_RESULT_UNKNOWN' }),
    ).resolves.toBe(true);
    await expect(consumeGitHubOAuthChallenge({ state, nonce: challenge.nonce, code })).rejects.toMatchObject({
      code: 'GITHUB_OAUTH_RESTART_REQUIRED',
    });
  });

  it('未提交当前同意版本时不创建挑战', async () => {
    await expect(createGitHubOAuthChallenge({ consentVersion: 'old-version' })).rejects.toMatchObject({
      code: 'GITHUB_OAUTH_CONSENT_REQUIRED',
    });
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it('OAuth 配置无效时不创建 Redis 挑战', async () => {
    vi.stubEnv('GITHUB_REDIRECT_URI', 'http://external.example/auth/callback');

    await expect(createGitHubOAuthChallenge({ consentVersion: GITHUB_OAUTH_CONSENT_VERSION })).rejects.toMatchObject({
      code: 'GITHUB_OAUTH_REDIRECT_INVALID',
    });
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it('允许本地开发环境使用 HTTP 回调', async () => {
    vi.stubEnv('GITHUB_REDIRECT_URI', 'http://127.0.0.1:5173/auth/callback');

    const challenge = await createGitHubOAuthChallenge({
      consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
    });

    expect(new URL(challenge.authorizationUrl).searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:5173/auth/callback',
    );
  });

  it('从 Cookie 请求头读取 OAuth nonce', () => {
    expect(
      readGitHubOAuthNonce({
        headers: { cookie: 'sid=session; ln_github_oauth_nonce=nonce-value; theme=day' },
      }),
    ).toBe('nonce-value');
  });
});

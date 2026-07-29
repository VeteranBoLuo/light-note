import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn();

vi.mock('@/http/request', () => ({ apiBasePost }));

const {
  GITHUB_OAUTH_CONSENT_VERSION,
  consumeGithubOAuthFlow,
  createGithubAuthorizationUrl,
  isTrustedGithubAuthorizationUrl,
  rememberGithubOAuthFlow,
} = await import('./githubOAuth');

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe('GitHub OAuth 授权地址', () => {
  it('请求服务端创建带当前单独同意版本的授权地址', async () => {
    const authorizationUrl =
      'https://github.com/login/oauth/authorize?client_id=client&state=trusted-state&scope=user%3Aemail';
    apiBasePost.mockResolvedValue({ status: 200, data: { authorizationUrl } });

    await expect(createGithubAuthorizationUrl({ flow: 'register', signupSource: 'landing' })).resolves.toBe(
      authorizationUrl,
    );
    expect(apiBasePost).toHaveBeenCalledWith('/api/user/github/authorize', {
      consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
      flow: 'register',
      signupSource: 'landing',
    });
  });

  it('拒绝服务端返回的非 GitHub 或非 HTTPS 跳转地址', async () => {
    expect(isTrustedGithubAuthorizationUrl('https://evil.example/login/oauth/authorize?state=x')).toBe(false);
    expect(isTrustedGithubAuthorizationUrl('http://github.com/login/oauth/authorize?state=x')).toBe(false);
    expect(isTrustedGithubAuthorizationUrl('https://github.com/login/oauth/authorize')).toBe(false);

    apiBasePost.mockResolvedValue({
      status: 200,
      data: { authorizationUrl: 'https://evil.example/login/oauth/authorize?state=x' },
    });
    await expect(createGithubAuthorizationUrl({ flow: 'login' })).rejects.toThrow('GITHUB_OAUTH_START_FAILED');
  });

  it('只消费一次发起 OAuth 时记录的登录或注册流程', () => {
    rememberGithubOAuthFlow('register');

    expect(consumeGithubOAuthFlow()).toBe('register');
    expect(consumeGithubOAuthFlow()).toBeNull();
  });
});

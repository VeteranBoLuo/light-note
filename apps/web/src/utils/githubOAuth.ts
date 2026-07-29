import { apiBasePost } from '@/http/request';

export const GITHUB_OAUTH_CONSENT_VERSION = 'github-cross-border-2026-07-28';
const GITHUB_OAUTH_FLOW_STORAGE_KEY = 'ln-github-oauth-flow';

export type GithubOAuthFlow = 'login' | 'register';

export function rememberGithubOAuthFlow(flow: GithubOAuthFlow): void {
  try {
    sessionStorage.setItem(GITHUB_OAUTH_FLOW_STORAGE_KEY, flow);
  } catch {
    // 禁用会话存储时仍允许发起 OAuth，回调按普通登录入口兜底。
  }
}

export function consumeGithubOAuthFlow(): GithubOAuthFlow | null {
  try {
    const flow = sessionStorage.getItem(GITHUB_OAUTH_FLOW_STORAGE_KEY);
    sessionStorage.removeItem(GITHUB_OAUTH_FLOW_STORAGE_KEY);
    return flow === 'login' || flow === 'register' ? flow : null;
  } catch {
    return null;
  }
}

export function isTrustedGithubAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname === '/login/oauth/authorize' &&
      Boolean(url.searchParams.get('state'))
    );
  } catch {
    return false;
  }
}

export async function createGithubAuthorizationUrl({
  flow,
  signupSource = 'unknown',
}: {
  flow: GithubOAuthFlow;
  signupSource?: string;
}): Promise<string> {
  const response: any = await apiBasePost('/api/user/github/authorize', {
    consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
    flow,
    signupSource,
  });
  const authorizationUrl = response?.data?.authorizationUrl;
  if (response?.status !== 200 || !isTrustedGithubAuthorizationUrl(authorizationUrl)) {
    throw new Error(response?.msg || 'GITHUB_OAUTH_START_FAILED');
  }
  return authorizationUrl;
}

import { apiBasePost } from '@/http/request';

export const GITHUB_OAUTH_CONSENT_VERSION = 'github-cross-border-2026-07-28';

export type GithubOAuthFlow = 'login' | 'register';

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

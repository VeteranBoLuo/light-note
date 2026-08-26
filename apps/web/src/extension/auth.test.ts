import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extensionGet: vi.fn(),
  extensionPost: vi.fn(),
  clearSession: vi.fn(),
  getSession: vi.fn(),
  getDeviceId: vi.fn(),
  saveSession: vi.fn(),
}));

vi.mock('./api', () => ({
  EXTENSION_APP_ORIGIN: 'https://boluo66.top',
  extensionGet: mocks.extensionGet,
  extensionPost: mocks.extensionPost,
  isExtensionAuthError: (error: any) => error?.code === 'EXTENSION_AUTH_REQUIRED',
}));

vi.mock('./storage', () => ({
  clearExtensionSession: mocks.clearSession,
  getExtensionSession: mocks.getSession,
  getOrCreateDeviceId: mocks.getDeviceId,
  saveExtensionSession: mocks.saveSession,
}));

const {
  extensionAuthInternals,
  loginExtensionThroughWebsite,
  restoreExtensionSession,
} = await import('./auth');

describe('浏览器插件设备会话与网站授权', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDeviceId.mockResolvedValue('device-1');
    mocks.saveSession.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      runtime: { id: 'nkdlhmfjnokoicodeepadkamopdblbnd' },
      identity: {
        getRedirectURL: vi.fn(() => 'https://nkdlhmfjnokoicodeepadkamopdblbnd.chromiumapp.org/light-note-auth'),
        launchWebAuthFlow: vi.fn(async ({ url }: { url: string }) => {
          const authorization = new URL(url);
          return `https://nkdlhmfjnokoicodeepadkamopdblbnd.chromiumapp.org/light-note-auth?code=one-time-code&state=${encodeURIComponent(authorization.searchParams.get('state') || '')}`;
        }),
      },
    });
  });

  it('网站授权使用随机 state、S256 PKCE、设备摘要和精确 chromiumapp 回调', async () => {
    mocks.extensionPost.mockResolvedValue({
      sid: 'sid-1',
      user: { id: 'user-1', alias: '菠萝', role: 'user' },
    });

    await expect(loginExtensionThroughWebsite()).resolves.toMatchObject({ sid: 'sid-1', deviceId: 'device-1' });
    const launch = (chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const authorization = new URL(launch.url);
    const exchangeBody = mocks.extensionPost.mock.calls[0][1];
    expect(authorization.origin + authorization.pathname).toBe('https://boluo66.top/extension/authorize');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('code_challenge')).toBe(
      await extensionAuthInternals.sha256Base64Url(exchangeBody.codeVerifier),
    );
    expect(authorization.searchParams.get('device_digest')).toBe(
      await extensionAuthInternals.sha256Hex('device-1'),
    );
    expect(exchangeBody).toMatchObject({
      code: 'one-time-code',
      clientId: 'nkdlhmfjnokoicodeepadkamopdblbnd',
      redirectUri: 'https://nkdlhmfjnokoicodeepadkamopdblbnd.chromiumapp.org/light-note-auth',
    });
    expect(mocks.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'sid-1', deviceId: 'device-1', user: { id: 'user-1', alias: '菠萝', email: '', role: 'user', headPicture: '' } }),
    );
  });

  it('临时断网保留本地会话，明确鉴权失效才清理', async () => {
    const stored = { sid: 'sid-stored', deviceId: 'device-1', user: { id: 'user-1' } };
    mocks.getSession.mockResolvedValue(stored);
    mocks.extensionGet.mockRejectedValueOnce(new TypeError('offline'));
    await expect(restoreExtensionSession()).resolves.toBe(stored);
    expect(mocks.clearSession).not.toHaveBeenCalled();

    mocks.extensionGet.mockRejectedValueOnce({ code: 'EXTENSION_AUTH_REQUIRED' });
    await expect(restoreExtensionSession()).resolves.toBeNull();
    expect(mocks.clearSession).toHaveBeenCalledOnce();
  });
});

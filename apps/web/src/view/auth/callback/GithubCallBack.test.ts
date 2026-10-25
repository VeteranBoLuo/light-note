import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  alert: vi.fn(),
  destroy: vi.fn(),
  loggedIn: vi.fn(),
  error: vi.fn(),
  router: {
    currentRoute: { value: { query: { code: 'provider-code', state: 'browser-state' } } },
    replace: vi.fn(),
    push: vi.fn(),
  },
  user: { id: 'owner', setUserInfo: vi.fn(), tagTotal: 0 },
  bookmark: { isMobile: false, loadTagList: vi.fn(), refreshTag: vi.fn(), openAuthModal: vi.fn() },
}));
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }));
vi.mock('@/http/request', () => ({ apiBasePost: mocks.post, apiBaseGet: mocks.get }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user, bookmarkStore: () => mocks.bookmark }));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: mocks.alert, destroy: mocks.destroy },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({ default: { error: mocks.error } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));
vi.mock('@/utils/authStorage', () => ({ markLoggedIn: mocks.loggedIn }));
vi.mock('@/utils/androidBridge.ts', () => ({ persistAndroidAuthSession: vi.fn() }));
vi.mock('@/utils/preferences.ts', () => ({ getHomePagePreference: () => 'workbench' }));
vi.mock('@/utils/appEntry.ts', () => ({
  getRuntimeApplicationEntryPath: () => '/workbenches',
  getRuntimePostRegistrationPath: () => '/workbenches',
}));
vi.mock('@/utils/githubOAuth.ts', () => ({
  consumeGithubOAuthFlow: () => 'login',
  createGithubAuthorizationUrl: vi.fn(),
  rememberGithubOAuthFlow: vi.fn(),
}));
vi.mock('@/utils/quickSaveAuthReturn.ts', () => ({
  clearQuickSaveAuthReturnPath: vi.fn(),
  resolveQuickSaveAuthReturnPath: () => '',
}));
vi.mock('@/utils/extensionAuthReturn.ts', () => ({
  clearExtensionAuthReturnPath: vi.fn(),
  resolveExtensionAuthReturnPath: () => '',
}));
vi.mock('@/utils/authNavigationIntent.ts', () => ({
  clearAuthNavigationIntent: vi.fn(),
  resolveAuthNavigationIntent: () => '',
}));
const { default: GithubCallBack } = await import('./GithubCallBack.vue');

describe('GitHub 同邮箱确认绑定与登录恢复', () => {
  let app: ReturnType<typeof createApp>, host: HTMLDivElement;
  const flush = async () => {
    for (let i = 0; i < 15; i++) await nextTick();
  };
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mocks.router.replace.mockResolvedValue(undefined);
    mocks.router.push.mockResolvedValue(undefined);
    mocks.bookmark.loadTagList.mockResolvedValue([]);
    mocks.get.mockResolvedValue({ data: { id: 'owner', preferences: {} } });
    mocks.post.mockResolvedValue({ status: 409, data: { code: 'GITHUB_OAUTH_EMAIL_CONFLICT', retryable: false } });
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    app?.unmount();
    host.remove();
    sessionStorage.clear();
    localStorage.clear();
  });
  async function mount() {
    app = createApp(GithubCallBack).use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    await flush();
  }
  it('冲突时仅显示邮箱登录与找回说明，不提供确认绑定或重新授权入口', async () => {
    await mount();
    expect(host.textContent).toContain('邮箱登录或找回密码');
    expect(host.textContent).not.toContain('重新授权 GitHub');
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.loggedIn).not.toHaveBeenCalled();
    const button = [...host.querySelectorAll('button')].find((x) => x.textContent?.includes('邮箱'));
    button?.click();
    await flush();
    expect(mocks.bookmark.openAuthModal).toHaveBeenCalledWith('登录', 'github_callback');
    expect(localStorage.getItem('rememberedSid')).toBeNull();
  });
  it('同邮箱先展示确认，确认前不提交关联也不标记登录', async () => {
    mocks.post
      .mockResolvedValueOnce({
        status: 409,
        data: { bindingRequired: true, maskedEmail: 'o***@example.com', githubLogin: 'octo' },
      })
      .mockResolvedValueOnce({ status: 200, data: { sid: 'bound-session' } });
    await mount();
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: '此邮箱已注册过轻笺', okText: '确认绑定并登录' }),
    );
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.loggedIn).not.toHaveBeenCalled();
    mocks.alert.mock.calls[0][0].onOk();
    await flush();
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/api/user/github/bind',
      { state: 'browser-state', confirm: true },
      expect.any(Object),
    );
    expect(mocks.loggedIn).toHaveBeenCalledOnce();
    expect(localStorage.getItem('rememberedSid')).toBe('bound-session');
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/workbenches');
  });
  it('取消只取消票据，不登录也不要求原密码或验证码', async () => {
    mocks.post
      .mockResolvedValueOnce({ status: 409, data: { bindingRequired: true } })
      .mockResolvedValueOnce({ status: 200, data: { cancelled: true } });
    await mount();
    mocks.alert.mock.calls[0][0].onCancel();
    await flush();
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/api/user/github/bind',
      { state: 'browser-state', confirm: false },
      expect.any(Object),
    );
    expect(mocks.loggedIn).not.toHaveBeenCalled();
    expect(host.textContent).toContain('已取消绑定');
    expect(host.querySelector('input')).toBeNull();
  });
  it('确认失败保留错误与重新授权入口，不误标记登录', async () => {
    mocks.post.mockResolvedValueOnce({ status: 409, data: { bindingRequired: true } }).mockResolvedValueOnce({
      status: 409,
      msg: '账号已变化，请重新授权',
      data: { code: 'GITHUB_OAUTH_ACCOUNT_CHANGED' },
    });
    await mount();
    mocks.alert.mock.calls[0][0].onOk();
    await flush();
    expect(host.textContent).toContain('账号已变化');
    expect(host.textContent).toContain('重新授权 GitHub');
    expect(mocks.loggedIn).not.toHaveBeenCalled();
  });
  it('确认框打开时离开页面会关闭确认，不再发送绑定请求', async () => {
    mocks.post.mockResolvedValueOnce({ status: 409, data: { bindingRequired: true } });
    await mount();
    app.unmount();
    await flush();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledOnce();
  });
  it('普通 GitHub 登录继续恢复偏好并进入应用', async () => {
    mocks.post.mockResolvedValueOnce({ status: 200, data: { sid: 'existing-session' } });
    await mount();
    expect(mocks.loggedIn).toHaveBeenCalledOnce();
    expect(localStorage.getItem('rememberedSid')).toBe('existing-session');
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/workbenches');
    expect(sessionStorage.getItem('gh_oauth_handled:browser-state')).toBe('1');
    expect(Object.keys(sessionStorage).some((key) => key.includes('provider-code'))).toBe(false);
  });
  it('浏览器禁止存储时仍可完成 Cookie 登录，不误报网络失败', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    mocks.post.mockResolvedValueOnce({ status: 200, data: { sid: 'cookie-session' } });
    await mount();
    expect(mocks.loggedIn).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/workbenches');
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it('离开页面后忽略迟到的成功回调', async () => {
    let resolve: (value: unknown) => void;
    mocks.post.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await mount();
    app.unmount();
    resolve!({ status: 200, data: { sid: 'late-session' } });
    await flush();
    expect(mocks.loggedIn).not.toHaveBeenCalled();
    expect(localStorage.getItem('rememberedSid')).toBeNull();
  });
});

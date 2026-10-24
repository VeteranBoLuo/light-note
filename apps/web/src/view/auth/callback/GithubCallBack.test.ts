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

describe('GitHub 同邮箱冲突转邮箱登录', () => {
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
  it('旧服务的 bindingRequired 响应也不再提交匿名确认', async () => {
    mocks.post.mockResolvedValueOnce({
      status: 409,
      data: { bindingRequired: true, maskedEmail: 'o***@example.com', githubLogin: 'octo' },
    });
    await mount();
    expect(host.textContent).toContain('邮箱登录或找回密码');
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.loggedIn).not.toHaveBeenCalled();
  });
  it('普通 GitHub 登录继续恢复偏好并进入应用', async () => {
    mocks.post.mockResolvedValueOnce({ status: 200, data: { sid: 'existing-session' } });
    await mount();
    expect(mocks.loggedIn).toHaveBeenCalledOnce();
    expect(localStorage.getItem('rememberedSid')).toBe('existing-session');
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/workbenches');
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import { apiBasePost, type ApiResponse } from '@/http/request';
import zhCN from '@/i18n/locales/zh-CN-core';
import LoginPage from './LoginPage.vue';

vi.mock('@/store', () => ({
  bookmarkStore: () => ({}),
  useUserStore: () => ({}),
}));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
vi.mock('@/router', () => ({ default: {} }));
vi.mock('@/i18n', () => ({ setLocale: vi.fn() }));
vi.mock('@/utils/androidBridge', () => ({ persistAndroidAuthSession: vi.fn() }));
vi.mock('@/utils/githubOAuth', () => ({
  createGithubAuthorizationUrl: vi.fn(),
  rememberGithubOAuthFlow: vi.fn(),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

const credentials = { email: 'user@example.test', password: 'wrong-password' };
const rejectedCredentials = { status: 401, msg: '邮箱或密码不正确', data: null };
let cleanup: (() => void) | undefined;

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(LoginPage, { title: '登录', formData: reactive({ ...credentials }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.component('BButton', BButton);
  app.component('BCheckbox', BCheckbox);
  app.component('BInput', BInput);
  app.directive('click-log', {});
  const vm = app.mount(host) as unknown as { handleLogin: () => Promise<void> };
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    host,
    login: vm.handleLogin,
    error: () => host.querySelector('[role="alert"]'),
    editPassword: async () => {
      const input = host.querySelector<HTMLInputElement>('#auth-login-password')!;
      input.value = 'edited-password';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await nextTick();
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('邮箱登录失败反馈', () => {
  it('把凭据错误留在表单里，修改密码后清除', async () => {
    vi.mocked(apiBasePost).mockResolvedValueOnce(rejectedCredentials);
    const { host, login, error, editPassword } = mount();

    await login();

    expect(error()?.textContent).toBe(rejectedCredentials.msg);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/user/login',
      { ...credentials, rememberMe: true },
      { silent: true },
    );
    await editPassword();
    expect(error()).toBeNull();
  });

  it('用户修改了本次提交的凭据后，忽略旧响应中的错误', async () => {
    let finishLogin!: (response: ApiResponse) => void;
    vi.mocked(apiBasePost).mockReturnValueOnce(new Promise((resolve) => { finishLogin = resolve; }));
    const { login, error, editPassword } = mount();
    const request = login();

    await editPassword();
    finishLogin(rejectedCredentials);
    await request;

    expect(error()).toBeNull();
  });

  it.each([
    [{ code: 'HTTP_429', message: '登录尝试过于频繁，请5分钟后再试' }, '登录尝试过于频繁，请5分钟后再试'],
    [new Error('unexpected error'), '登录失败，请重试'],
  ])('请求异常仍能在表单中提示', async (failure, description) => {
    vi.mocked(apiBasePost).mockRejectedValueOnce(failure);
    const { login, error } = mount();

    await login();

    expect(error()?.textContent).toBe(description);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { apiBasePost } from '@/http/request';
import { createGithubAuthorizationUrl } from '@/utils/githubOAuth';
import zhCN from '@/i18n/locales/zh-CN-core';
import enUS from '@/i18n/locales/en-US-core';
import RegisterPage from './RegisterPage.vue';

vi.mock('@/store', () => ({
  bookmarkStore: () => ({ authModalSource: 'nav' }),
  useUserStore: () => ({}),
}));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/utils/conversion', () => ({ trackConversion: vi.fn() }));
vi.mock('@/router', () => ({ default: { push: vi.fn(), replace: vi.fn() } }));
vi.mock('@/i18n', () => ({ setLocale: vi.fn() }));
vi.mock('@/utils/androidBridge', () => ({ persistAndroidAuthSession: vi.fn() }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));
vi.mock('@/utils/githubOAuth', () => ({
  createGithubAuthorizationUrl: vi.fn(),
  rememberGithubOAuthFlow: vi.fn(),
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

let cleanup: (() => void) | undefined;

function mount(locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(RegisterPage, { title: '注册' });
  app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, 'en-US': enUS } }));
  app.component('BInput', BInput);
  app.component('BButton', BButton);
  app.directive('click-log', {});
  const vm = app.mount(host) as unknown as { handleRegister: () => Promise<void> };
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, vm };
}

async function fill(host: HTMLElement, field: 'alias' | 'email' | 'password', value: string) {
  const input = host.querySelector<HTMLInputElement>(`#auth-register-${field}`)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

beforeEach(() => {
  vi.clearAllMocks();
  // 停在接口边界，避免触发登录、导航和账号初始化。
  vi.mocked(apiBasePost).mockResolvedValue({ status: 400 } as any);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('邮箱注册昵称必填', () => {
  it.each(['', ' \t　 '])('空昵称 %j 禁用邮箱注册，直接提交也会拦截', async (alias) => {
    const { host, vm } = mount();
    await fill(host, 'email', 'new@example.com');
    await fill(host, 'password', 'secret123');
    await fill(host, 'alias', alias);

    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await vm.handleRegister();

    expect(message.warning).toHaveBeenCalledWith('请输入昵称');
    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it('超过 20 字符的值即使绕过输入框限制，也不能提交', async () => {
    const { host, vm } = mount();
    await fill(host, 'email', 'new@example.com');
    await fill(host, 'password', 'secret123');
    await fill(host, 'alias', '轻'.repeat(21));

    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await vm.handleRegister();

    expect(message.warning).toHaveBeenCalledWith('昵称长度不能超过20个字符');
    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it.each(['  轻  ', '  轻笺用户  ', `  ${'轻'.repeat(20)}  `])(
    '合法昵称 %j 去掉首尾空格后随邮箱注册请求发送',
    async (alias) => {
      const { host, vm } = mount();
      await fill(host, 'email', '  new@example.com  ');
      await fill(host, 'password', 'secret123');
      await fill(host, 'alias', alias);

      expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
      await vm.handleRegister();

      expect(apiBasePost).toHaveBeenCalledWith('/api/user/registerUser', {
        alias: alias.trim(),
        email: 'new@example.com',
        password: 'secret123',
        role: 'user',
        signupSource: 'nav',
      });
      expect(message.warning).not.toHaveBeenCalled();
    },
  );

  it('英文表单使用英文昵称提示', async () => {
    const { host, vm } = mount('en-US');
    await fill(host, 'email', 'new@example.com');
    await fill(host, 'password', 'secret123');

    expect(host.querySelector<HTMLInputElement>('#auth-register-alias')!.placeholder).toBe(
      'Enter a nickname (1–20 characters)',
    );
    await vm.handleRegister();

    expect(message.warning).toHaveBeenCalledWith('Please enter a nickname');
    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it('昵称未填写仍可发起 GitHub 注册', async () => {
    vi.mocked(createGithubAuthorizationUrl).mockRejectedValue(new Error('test-provider-unavailable'));
    const { host } = mount();
    const button = host.querySelector<HTMLButtonElement>('.auth-secondary')!;

    expect(button.disabled).toBe(false);
    button.click();

    await vi.waitFor(() => {
      expect(createGithubAuthorizationUrl).toHaveBeenCalledWith({ flow: 'register', signupSource: 'nav' });
      expect(message.error).toHaveBeenCalledWith(zhCN.auth.githubStartFailed);
    });
    expect(message.warning).not.toHaveBeenCalled();
    expect(apiBasePost).not.toHaveBeenCalled();
  });
});

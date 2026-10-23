import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), success: vi.fn(), user: null as any }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/http/request', () => ({ apiBaseGet: mocks.get, apiBasePost: mocks.post }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { success: mocks.success } }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible', 'title'],
    template: '<section v-if="visible"><h2>{{ title }}</h2><slot/><slot name="footer"/></section>',
  },
}));
import Dialog from './AccountEmailDialog.vue';
let app: ReturnType<typeof createApp>, host: HTMLDivElement;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};
async function mount() {
  const visible = ref(true);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(Dialog, { visible: visible.value, 'onUpdate:visible': (value: boolean) => (visible.value = value) }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  await flush();
}
function input(id: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(`#${id}`)!;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
async function submit() {
  (host.querySelector('.email-actions button:last-child') as HTMLButtonElement).click();
  await flush();
}
async function send() {
  input('account-email-new', 'new@example.com');
  input('account-email-password', 'original-password');
  await nextTick();
  await submit();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.user = reactive({ id: 'owner', role: 'user', adminContext: null });
  mocks.get.mockResolvedValue({
    status: 200,
    data: { email: 'old@example.com', hasPassword: true, githubBound: false, recentGithub: false },
  });
  mocks.post.mockImplementation(async (url) => ({
    status: 200,
    data: url.endsWith('request')
      ? { challenge: 'ticket', maskedEmail: 'ne***@example.com', resendAfter: 60 }
      : { email: 'new@example.com' },
  }));
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.useRealTimers();
});
describe('更换邮箱弹框', () => {
  it('只验证当前密码和新邮箱，发送阶段不改账号或触发退出', async () => {
    const expired = vi.fn();
    window.addEventListener('light-note:auth-expired', expired);
    await mount();
    await send();
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/user/email-change/request',
      { email: 'new@example.com', oldPassword: 'original-password' },
      { silent: true },
    );
    expect(host.querySelector('#account-email-new')).toBeNull();
    expect(host.querySelector('#account-email-password')).toBeNull();
    expect(host.querySelector('#account-email-code')).not.toBeNull();
    expect(host.textContent).toContain('ne***@example.com');
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener('light-note:auth-expired', expired);
  });
  it('确认提交验证码票据，成功后提示新邮箱登录并使会话失效', async () => {
    const expired = vi.fn();
    window.addEventListener('light-note:auth-expired', expired);
    await mount();
    await send();
    input('account-email-code', '123456');
    await nextTick();
    await submit();
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/api/user/email-change/confirm',
      { challenge: 'ticket', code: '123456' },
      { silent: true },
    );
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(expired).toHaveBeenCalledOnce();
    expect(host.querySelector('section')).toBeNull();
    window.removeEventListener('light-note:auth-expired', expired);
  });
  it('错误验证码保留输入与重试入口，失败不退出登录', async () => {
    await mount();
    await send();
    mocks.post.mockResolvedValue({ status: 400, msg: '验证码错误或已过期' });
    input('account-email-code', '123456');
    await nextTick();
    await submit();
    expect(host.textContent).toContain('验证码错误或已过期');
    expect(host.querySelector('#account-email-code')).not.toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it('修改新邮箱时丢弃旧票据，倒计时结束前不能再次发信', async () => {
    await mount();
    await send();
    (host.querySelector('.email-form > button') as HTMLButtonElement).click();
    await flush();
    expect(host.querySelector('#account-email-new')).not.toBeNull();
    expect((host.querySelector('.email-actions button:last-child') as HTMLButtonElement).disabled).toBe(true);
    vi.advanceTimersByTime(60_000);
    await flush();
    expect((host.querySelector('.email-actions button:last-child') as HTMLButtonElement).disabled).toBe(false);
    expect((host.querySelector('#account-email-password') as HTMLInputElement).value).toBe('');
  });
  it('近期 GitHub 身份可直接验证新邮箱，不要求不存在的旧密码', async () => {
    mocks.get.mockResolvedValue({
      status: 200,
      data: { email: '123@users.noreply.github.com', hasPassword: false, githubBound: true, recentGithub: true },
    });
    await mount();
    expect(host.querySelector('#account-email-password')).toBeNull();
    expect(host.textContent).toContain('已通过 GitHub 验证');
    input('account-email-new', 'new@example.com');
    await nextTick();
    await submit();
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/user/email-change/request',
      { email: 'new@example.com' },
      { silent: true },
    );
  });
  it('仅绑定 GitHub 而没有近期验证时必须先重新验证', async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { hasPassword: false, githubBound: true, recentGithub: false } });
    await mount();
    expect(host.textContent).toContain('通过 GitHub 重新验证');
    expect((host.querySelector('.email-actions button:last-child') as HTMLButtonElement).disabled).toBe(true);
  });
  it('弹框打开后 GitHub 身份证明过期时提供重新验证入口', async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { hasPassword: false, githubBound: true, recentGithub: true } });
    await mount();
    mocks.post.mockResolvedValue({
      status: 400,
      data: { code: 'EMAIL_CHANGE_IDENTITY_REQUIRED' },
      msg: '请重新验证身份',
    });
    input('account-email-new', 'new@example.com');
    await nextTick();
    await submit();
    expect(host.textContent).toContain('通过 GitHub 重新验证');
    expect((host.querySelector('.email-actions button:last-child') as HTMLButtonElement).disabled).toBe(true);
  });
  it('账号加载失败保留重试，不能继续发送', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    await mount();
    expect(host.textContent).toContain('账号信息加载失败');
    expect((host.querySelector('.email-actions button:last-child') as HTMLButtonElement).disabled).toBe(true);
  });
  it('切号后忽略旧请求的迟到成功响应，不退出新账号', async () => {
    await mount();
    await send();
    let resolve!: (value: any) => void;
    mocks.post.mockImplementation(() => new Promise((result) => (resolve = result)));
    input('account-email-code', '123456');
    await nextTick();
    await submit();
    mocks.user.id = 'other';
    await flush();
    resolve({ status: 200, data: { email: 'new@example.com' } });
    await flush();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

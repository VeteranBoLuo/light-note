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
import Dialog from './AccountPasswordDialog.vue';
import LegacyDialog from '../personCenter/myInfo/PassConfigDlg.vue';
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};
async function mount(component = Dialog) {
  const visible = ref(true);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () => h(component, { visible: visible.value, 'onUpdate:visible': (v: boolean) => (visible.value = v) }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  await flush();
}
function input(id: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(`#${id}`)!;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const confirm = async () => {
  (host.querySelector('.password-actions button:last-child') as HTMLButtonElement).click();
  await flush();
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = reactive({ id: 'u1', role: 'user', adminContext: null });
  mocks.get.mockResolvedValue({ status: 200, data: { email: 'fixture@example.com', hasPassword: false } });
  mocks.post.mockResolvedValue({ status: 200 });
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
describe('账号密码验证', () => {
  it('未设置密码展示邮箱验证码，不要求原密码；成功后通知登录失效', async () => {
    const expired = vi.fn();
    window.addEventListener('light-note:auth-expired', expired);
    await mount();
    expect(host.textContent).toContain('设置密码');
    expect(host.querySelector('#account-password-current')).toBeNull();
    input('account-password-code', '234567');
    input('account-password-new', 'new-password');
    input('account-password-confirm', 'new-password');
    await nextTick();
    await confirm();
    expect(mocks.post).toHaveBeenCalledWith('/api/user/configPassword', { code: '234567', password: 'new-password' });
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener('light-note:auth-expired', expired);
  });
  it('已有密码使用原密码，可切换到邮箱找回', async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { email: 'fixture@example.com', hasPassword: true } });
    await mount();
    expect(host.querySelector('#account-password-current')).not.toBeNull();
    (host.querySelector('.password-switch') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('#account-password-current')).toBeNull();
    expect(host.querySelector('#account-password-code')).not.toBeNull();
  });
  it('历史状态未知默认提供邮箱验证，同时保留原密码入口', async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { email: 'fixture@example.com', hasPassword: null } });
    await mount();
    expect(host.textContent).toContain('设置或修改密码');
    expect(host.querySelector('#account-password-code')).not.toBeNull();
    expect(host.querySelector('.password-switch')?.textContent).toContain('使用当前密码');
  });
  it('确认密码不一致时不发请求', async () => {
    await mount();
    input('account-password-code', '234567');
    input('account-password-new', 'new-password');
    input('account-password-confirm', 'different');
    await nextTick();
    await confirm();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('GitHub 占位邮箱不能发送验证码', async () => {
    mocks.get.mockResolvedValue({
      status: 200,
      data: { email: 'fixture@users.noreply.github.com', hasPassword: false },
    });
    await mount();
    expect((host.querySelector('.password-code button') as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain('可接收验证码的邮箱');
  });
  it('切换账号后忽略旧账号迟到的提交成功响应', async () => {
    let resolve!: (value: any) => void;
    mocks.post.mockImplementation(() => new Promise((r) => (resolve = r)));
    await mount();
    input('account-password-code', '234567');
    input('account-password-new', 'new-password');
    input('account-password-confirm', 'new-password');
    await nextTick();
    await confirm();
    mocks.user.id = 'other';
    await flush();
    resolve({ status: 200 });
    await flush();
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it('个人中心入口使用相同的首次设置验证流程', async () => {
    await mount(LegacyDialog);
    expect(host.querySelector('#account-password-code')).not.toBeNull();
    expect(host.querySelector('#account-password-current')).toBeNull();
  });
});

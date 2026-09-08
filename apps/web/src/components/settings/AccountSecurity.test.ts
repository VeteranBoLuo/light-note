import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), alert: vi.fn(), success: vi.fn(), user: null as any }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/http/request', () => ({ apiBaseGet: mocks.get, apiBasePost: mocks.post }));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: mocks.alert } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({ default: { template: '<div />' } }));
import AccountSecurity from './AccountSecurity.vue';
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
const sessions = [
  { id: 'here', current: true, userAgent: 'Macintosh Chrome', ip: '192.0.2.1' },
  { id: 'other', current: false, userAgent: 'Windows Chrome', ip: '192.0.2.2' },
];
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(AccountSecurity);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = reactive({ id: 'user', role: 'user', adminContext: null });
  mocks.get.mockResolvedValue({ status: 200, data: { email: 'test@example.com', password: '******' } });
  mocks.post.mockImplementation(async (url) => ({ status: 200, data: url.endsWith('getMySessions') ? sessions : {} }));
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
describe('账号设备下线', () => {
  it('本机没有单独下线操作，其余设备确认前不发送写请求', async () => {
    await mount();
    expect(host.querySelector('.is-current .sess-revoke')).toBeNull();
    (host.querySelector('.sess-revoke') as HTMLButtonElement).click();
    expect(mocks.alert).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('下线失败保留所有设备并显示局部错误', async () => {
    await mount();
    mocks.post.mockRejectedValueOnce(new Error('offline'));
    (host.querySelector('.sess-revoke') as HTMLButtonElement).click();
    await mocks.alert.mock.calls[0][0].onOk();
    await flush();
    expect(host.querySelectorAll('.sess-item')).toHaveLength(2);
    expect(host.textContent).toContain('下线失败');
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it('仅在下线成功后刷新设备列表', async () => {
    await mount();
    (host.querySelector('.sess-revoke') as HTMLButtonElement).click();
    await mocks.alert.mock.calls[0][0].onOk();
    expect(mocks.post.mock.calls.map((c) => c[0])).toEqual([
      '/api/user/getMySessions',
      '/api/user/revokeSession',
      '/api/user/getMySessions',
    ]);
  });
  it('确认框打开后切号，旧确认不能下线新账号设备', async () => {
    await mount();
    (host.querySelector('.sess-revoke') as HTMLButtonElement).click();
    const confirm = mocks.alert.mock.calls[0][0].onOk;
    mocks.user.id = 'new-user';
    await flush();
    await confirm();
    expect(mocks.post.mock.calls.filter((c) => c[0].endsWith('revokeSession'))).toHaveLength(0);
  });
});

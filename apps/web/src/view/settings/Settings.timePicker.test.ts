import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ save: vi.fn(), user: null as any, desktop: null as any }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/utils/savePreference', () => ({
  updatePreference: mocks.save,
  usePreferenceSaveState: () => ({ pending: () => false, states: {}, retry: vi.fn() }),
}));
vi.mock('@/utils/browserPushPlatform', () => ({ useBrowserPushDesktop: () => mocks.desktop }));
vi.mock('@/utils/authStorage', () => ({ isAdminLoginPreview: () => false }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: defineComponent({
    props: ['visible'],
    setup:
      (p, { slots }) =>
      () =>
        p.visible ? h('div', { role: 'dialog' }, [slots.default?.(), slots.footer?.()]) : null,
  }),
}));
vi.mock('@/components/base/BasicComponents/BTimePicker.vue', () => ({
  default: defineComponent({
    props: ['value'],
    emits: ['update:value'],
    setup:
      (p, { emit }) =>
      () =>
        h('input', {
          value: p.value,
          onInput: (e: Event) => emit('update:value', (e.target as HTMLInputElement).value),
        }),
  }),
}));
import QuietHours from '@/components/notification/BrowserPushQuietHoursSettings.vue';
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
const flush = async () => {
  await Promise.resolve();
  await nextTick();
};
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(QuietHours);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  await flush();
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  expect(button).toBeTruthy();
  button!.click();
  await flush();
}
beforeEach(() => {
  mocks.user = reactive({
    id: 'owner',
    role: 'user',
    adminContext: null,
    preferences: { notificationsDnd: false, notificationsDndStart: '22:00', notificationsDndEnd: '08:00' },
  });
  mocks.desktop = ref(true);
  mocks.save.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
describe('免打扰确认与取消', () => {
  it('开启只打开编辑器，取消不改变账号偏好也不保存', async () => {
    await mount();
    (host.querySelector('[role="switch"]') as HTMLButtonElement).click();
    await flush();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
    await click('取消');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.user.preferences.notificationsDnd).toBe(false);
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
  });
  it('确认后原子提交开关、起止时间和当前时区', async () => {
    await mount();
    (host.querySelector('[role="switch"]') as HTMLButtonElement).click();
    await flush();
    await click('确认时段');
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      notificationsDnd: true,
      notificationsDndStart: '22:00',
      notificationsDndEnd: '08:00',
      notificationsTimezoneOffset: new Date().getTimezoneOffset(),
    });
  });
  it('相同起止时间不提交，历史相同时间显示真实语义', async () => {
    mocks.user.preferences.notificationsDnd = true;
    mocks.user.preferences.notificationsDndEnd = '22:00';
    await mount();
    expect(host.textContent).toContain('不延后通知');
    await click('修改时段');
    await click('确认时段');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('不同');
  });
  it('已开启时编辑和取消保持旧配置，关闭即时只保存开关', async () => {
    mocks.user.preferences.notificationsDnd = true;
    await mount();
    await click('修改时段');
    const input = host.querySelector('input')!;
    input.value = '21:00';
    input.dispatchEvent(new Event('input'));
    await click('取消');
    expect(mocks.user.preferences.notificationsDndStart).toBe('22:00');
    (host.querySelector('[role="switch"]') as HTMLButtonElement).click();
    await flush();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ notificationsDnd: false });
  });
  it('切号关闭草稿，手机完全不显示免打扰', async () => {
    await mount();
    (host.querySelector('[role="switch"]') as HTMLButtonElement).click();
    await flush();
    mocks.user.id = 'other';
    await flush();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    mocks.desktop.value = false;
    await flush();
    expect(host.querySelector('[role="switch"]')).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

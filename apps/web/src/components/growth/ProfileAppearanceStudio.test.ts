import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

const actions = vi.hoisted(() => ({ update: vi.fn(), render: vi.fn(), loadShop: vi.fn(), equip: vi.fn() }));
const user = reactive({ id: 'studio-user', role: 'user', headPicture: 'current-avatar', adminContext: null });
const bookmark = reactive({ isShowLogin: false });
const shop = ref<any>(null);
const growth = ref({ equippedFrame: null, equippedBackground: 'background_coast' });
vi.mock('@/store', () => ({ useUserStore: () => user, bookmarkStore: () => bookmark }));
vi.mock('@/api/userApi', () => ({ default: { updateUserInfo: actions.update } }));
vi.mock('@/composables/useGrowth', () => ({
  useGrowth: () => ({
    growth,
    shop,
    shopLoading: ref(false),
    dashboard: ref(null),
    loadShop: actions.loadShop,
    loadDashboard: vi.fn(),
    equipFrame: actions.equip,
    equipBackground: actions.equip,
    buyItem: vi.fn(),
    claimAchievement: vi.fn(),
  }),
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: vi.fn() } }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    template: '<div v-if="visible"><slot name="title"/><slot/><slot name="footer"/></div>',
  },
}));
vi.mock('@/components/communityChat/ChatUserProfileContent.vue', () => ({
  default: {
    props: ['profile'],
    template: '<div class="test-stage" :data-avatar="profile.avatar" :data-background="profile.backgroundId" />',
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/growth/ProfileBackgroundArt.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/config/builtinAvatars', () => ({
  BUILTIN_AVATARS: [
    {
      id: 'mountain-fox',
      nameKey: 'myInfo.builtinAvatarNames.mountainFox',
      descriptionKey: 'myInfo.builtinAvatarDescriptions.mountainFox',
    },
  ],
  builtinAvatarPreviewStyle: () => ({}),
  renderBuiltinAvatar: actions.render,
}));
const { default: Studio } = await import('./ProfileAppearanceStudio.vue');
let cleanup: (() => void) | undefined;
const flush = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};
function mount(initialTab?: 'avatar' | 'frame' | 'background') {
  const props = reactive({
    open: true,
    initialTab,
    profile: {
      name: '昵称草稿',
      avatar: user.headPicture,
      bio: '简介草稿',
      role: 'member',
      frameId: null,
      backgroundId: 'background_coast',
      level: 15,
      levelName: '文圣',
      achievements: [],
    },
  });
  const onSaved = vi.fn();
  const onAppearanceSaved = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(Studio as any, { ...props, 'onAvatar-saved': onSaved, onSaved: onAppearanceSaved }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const click = async (label: string) => {
    const button = [...host.querySelectorAll<HTMLElement>('button, [role="tab"]')].find(
      (el) => el.textContent?.replace(/\s/g, '') === label || el.getAttribute('aria-label') === label,
    );
    if (!button) throw Error(`Missing button: ${label}`);
    button.click();
    await flush();
  };
  return { host, click, onSaved, onAppearanceSaved, props };
}
beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollTo = vi.fn();
  Object.assign(user, { id: 'studio-user', role: 'user', headPicture: 'current-avatar', adminContext: null });
  shop.value = {
    equippedBackground: 'background_coast',
    equippedFrame: null,
    isVisitor: false,
    points: 2000,
    level: 15,
    purchaseEnabled: true,
    frames: [],
    items: [
      { id: 'background_coast', effect: 'background', owned: true, cost: 1000 },
      { id: 'background_sky', effect: 'background', owned: false, cost: 800 },
    ],
  };
  actions.update.mockResolvedValue({ status: 200 });
  actions.render.mockResolvedValue('new-fox-avatar');
});
afterEach(() => {
  cleanup?.();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

describe('unified profile appearance studio', () => {
  it('previews an avatar without writing and applies only the current avatar after confirmation', async () => {
    const { host, click, onSaved, onAppearanceSaved } = mount();
    await flush();
    expect(host.querySelector('.profile-avatar-options')).not.toBeNull();
    expect(host.querySelector('.appearance-studio__filters')).toBeNull();
    await click('山野向导狐');
    expect(host.querySelector('.test-stage')?.getAttribute('data-avatar')).toBe('new-fox-avatar');
    expect(actions.update).not.toHaveBeenCalled();
    await click('使用此头像');
    expect(actions.update).toHaveBeenCalledWith({ id: 'studio-user', headPicture: 'new-fox-avatar' }, { silent: true });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onAppearanceSaved).toHaveBeenCalledOnce();
    expect(host.querySelector('.appearance-studio__using')?.textContent).toContain('正在使用');
  });
  it('retains avatar trial across tabs and reverts all unused trial selections', async () => {
    const { host, click } = mount();
    await flush();
    await click('山野向导狐');
    await click('背景2');
    expect(host.querySelector('.appearance-studio__filters')).not.toBeNull();
    expect(host.querySelector('.test-stage')?.getAttribute('data-avatar')).toBe('new-fox-avatar');
    await click('还原');
    expect(host.querySelector('.test-stage')?.getAttribute('data-avatar')).toBe('current-avatar');
    expect(actions.update).not.toHaveBeenCalled();
    expect(actions.equip).not.toHaveBeenCalled();
  });
  it('keeps avatar selection available when the appearance catalog fails', async () => {
    shop.value = null;
    const { host, click } = mount();
    await flush();
    await click('山野向导狐');
    await click('使用此头像');
    expect(user.headPicture).toBe('new-fox-avatar');
    expect(host.querySelector('.profile-avatar-options')).not.toBeNull();
  });
  it('opens the requested background tab on every visit and resets the filter', async () => {
    const { host, click, props } = mount('background');
    await flush();
    expect(host.querySelector('.appearance-studio__backgrounds')).not.toBeNull();
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('背景');
    await click('已拥有1');
    await click('头像');
    props.open = false;
    await flush();
    props.open = true;
    await flush();
    expect(host.querySelector('.appearance-studio__backgrounds')).not.toBeNull();
    expect(host.querySelector('.appearance-studio__filters [aria-selected="true"]')?.textContent).toContain('全部');
  });
  it.each([true, false])('notifies the owner only after applying a background succeeds (ok=%s)', async (ok) => {
    actions.equip.mockResolvedValueOnce({ status: 200, data: { ok } });
    const { host, click, onAppearanceSaved } = mount('background');
    await flush();
    host.querySelector<HTMLButtonElement>('.appearance-tile--background')!.click();
    await flush();
    expect(actions.equip).not.toHaveBeenCalled();
    expect(onAppearanceSaved).not.toHaveBeenCalled();
    await click('恢复默认');
    expect(actions.equip).toHaveBeenCalledWith(null);
    expect(onAppearanceSaved).toHaveBeenCalledTimes(ok ? 1 : 0);
  });
  it('ignores a background save response after the studio closes', async () => {
    let finish!: (value: unknown) => void;
    actions.equip.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { host, click, props, onAppearanceSaved } = mount('background');
    await flush();
    host.querySelector<HTMLButtonElement>('.appearance-tile--background')!.click();
    await flush();
    await click('恢复默认');
    props.open = false;
    await flush();
    finish({ status: 200, data: { ok: true } });
    await flush();
    expect(onAppearanceSaved).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const release = { versionName: '1.0.1', downloadPath: '/downloads/android/light-note-1.0.1.apk', released: true };
let userAgent = '';
const replace = vi.fn();
const loadGrowth = vi.fn(() => Promise.resolve());
const route = { name: 'workbenches', path: '/workbenches', meta: { mobileShell: 'today' } };
const growth = ref<{ equippedFrame?: string | null; hasUnreadLevelUp?: boolean } | null>(null);

vi.mock('@/config/androidRelease', () => ({
  get ANDROID_RELEASE() {
    return release;
  },
  OFFICIAL_HOST: 'boluo66.top',
}));
vi.mock('@/utils/androidBridge', () => ({
  postAndroidMessage: vi.fn(() => true),
  isLightNoteAndroidApp: () => /\bLightNoteAndroid\//i.test(userAgent),
  getLightNoteAndroidVersion: () => {
    const matched = /\bLightNoteAndroid\/([\w.-]+)/i.exec(userAgent);
    return matched ? matched[1] : '';
  },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/i18n', () => ({ default: { global: { t: (key: string) => key } } }));
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}));
vi.mock('@/store', () => ({
  useUserStore: () => ({
    id: 'u1',
    role: 'user',
    headPicture: 'data:image/png;base64,avatar',
  }),
}));
vi.mock('@/composables/useGrowth', () => ({ useGrowth: () => ({ growth, load: loadGrowth }) }));
vi.mock('@/composables/useMobileGlobalSearch', () => ({ useMobileGlobalSearch: () => ({ openSearch: vi.fn() }) }));
vi.mock('@/components/notification/NotificationBell.vue', () => ({
  default: { name: 'NotificationBellStub', template: '<span class="notification-bell-stub" />' },
}));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({
  default: { name: 'AvatarFramePreviewStub', template: '<span class="avatar-frame-stub" />' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { name: 'BButtonStub', template: '<button><slot /></button>' },
}));

const { resetAndroidAppUpdateForTest } = await import('@/composables/useAndroidAppUpdate');
const { default: MobileTopBar } = await import('./MobileTopBar.vue');

const APP_UA =
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36 LightNoteAndroid/1.0.0';

let cleanup: (() => void) | undefined;

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(MobileTopBar) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  userAgent = APP_UA;
  release.versionName = '1.0.1';
  release.released = true;
  route.name = 'workbenches';
  route.path = '/workbenches';
  route.meta.mobileShell = 'today';
  growth.value = null;
  loadGrowth.mockClear();
  replace.mockReset();
  window.localStorage.clear();
  resetAndroidAppUpdateForTest();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  window.localStorage.clear();
});

describe('移动顶栏 · 头像入口', () => {
  it('首屏主动加载成长快照，确保头像框和升级提醒无需先进入个人中心', () => {
    mount();
    expect(loadGrowth).toHaveBeenCalledTimes(1);
  });

  it('左侧使用头像入口并导航到个人中心', async () => {
    const host = mount();
    const entry = host.querySelector('.mobile-top-bar__profile') as HTMLButtonElement;
    expect(entry).toBeTruthy();
    expect(host.querySelector('.mobile-top-bar__brand')).toBeNull();
    entry.click();
    expect(replace).toHaveBeenCalledWith('/personCenter');
  });

  it('位于个人中心时保留 aria-current 语义但不额外套头像圆环', () => {
    route.name = 'personCenter';
    route.path = '/personCenter';
    route.meta.mobileShell = 'profile';
    const host = mount();
    const entry = host.querySelector('.mobile-top-bar__profile') as HTMLButtonElement;
    expect(entry.classList.contains('mobile-top-bar__profile--active')).toBe(false);
    expect(entry.getAttribute('aria-current')).toBe('page');
  });

  it('App 内有新版本时把原“我的”底栏红点迁到头像', () => {
    const host = mount();
    const dot = host.querySelector('.mobile-top-bar__profile-dot');
    expect(dot).toBeTruthy();
    expect(dot?.textContent?.trim()).toBe('');
    expect(dot?.getAttribute('aria-label')).toContain('1.0.1');
  });

  it('App 版本一致时不显示更新红点', () => {
    release.versionName = '1.0.0';
    const host = mount();
    expect(host.querySelector('.mobile-top-bar__profile-dot')).toBeNull();
  });

  it('用户已忽略当前版本时不显示更新红点', () => {
    window.localStorage.setItem('light-note:android-update-dismissed', '1.0.1');
    resetAndroidAppUpdateForTest();
    const host = mount();
    expect(host.querySelector('.mobile-top-bar__profile-dot')).toBeNull();
  });

  it('成长升级提醒和 App 更新共用头像聚合红点，但保留完整读屏语义', () => {
    growth.value = { hasUnreadLevelUp: true };
    const host = mount();
    const label = host.querySelector('.mobile-top-bar__profile-dot')?.getAttribute('aria-label') || '';
    expect(label).toContain(zhCN.growth.levelUpTitle);
    expect(label).toContain('1.0.1');
  });

  it('继续展示用户已经佩戴的成长头像框', () => {
    growth.value = { equippedFrame: 'frame_mint' };
    const host = mount();
    expect(host.querySelector('.avatar-frame-stub')).toBeTruthy();
  });

  it('普通手机浏览器且没有成长提醒时不显示红点', () => {
    userAgent = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36';
    resetAndroidAppUpdateForTest();
    const host = mount();
    expect(host.querySelector('.mobile-top-bar__profile-dot')).toBeNull();
  });
});

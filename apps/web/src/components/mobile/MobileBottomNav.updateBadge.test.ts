import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 底部导航「我的」上的新版本红点。
 *
 * 为什么这一环必须有测试：红点挂在常驻组件上，出问题的表现是"该红的时候不红"或"消不掉"，
 * 两者都不会报错、不会有日志，只能靠断言锁住。另外它与个人中心里的红点共享同一份
 * dismissed 状态（见 useAndroidAppUpdate 顶部说明），联动断言在那边的测试里。
 */

const release = { versionName: '1.0.1', downloadPath: '/downloads/android/light-note-1.0.1.apk', released: true };
let userAgent = '';

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
  useRoute: () => ({ name: 'workbenches', query: {}, meta: { mobileShell: 'today' }, fullPath: '/workbenches' }),
  useRouter: () => ({ replace: vi.fn(), resolve: (t: unknown) => ({ fullPath: String(t) }) }),
}));
vi.mock('@/store', () => ({
  inboxStore: () => ({
    todoAttentionTotal: 0,
    todoOverdueTotal: 0,
    todoDueTodayTotal: 0,
    refreshCount: vi.fn(),
  }),
  useUserStore: () => ({ id: 'u1', role: 'user' }),
}));
vi.mock('@/composables/useMobileNavigationState', () => ({
  getMobileResourceEntryPath: () => '/home',
  useMobileNavigationState: () => ({ saveResourceScroll: vi.fn(), scrollCurrentResourceToTop: vi.fn() }),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { name: 'BButtonStub', template: '<button><slot /></button>' },
}));

const { resetAndroidAppUpdateForTest } = await import('@/composables/useAndroidAppUpdate');
const { default: MobileBottomNav } = await import('./MobileBottomNav.vue');

const APP_UA = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36 LightNoteAndroid/1.0.0';

let cleanup: (() => void) | undefined;

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(MobileBottomNav) });
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
  window.localStorage.clear();
  resetAndroidAppUpdateForTest();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  window.localStorage.clear();
});

describe('底部导航 · 新版本红点', () => {
  it('App 内有新版时「我的」出现红点', () => {
    const host = mount();
    expect(host.querySelectorAll('.mobile-bottom-nav__badge--dot')).toHaveLength(1);
  });

  it('红点挂在「我的」那一项，不是别的 tab', () => {
    const host = mount();
    const dot = host.querySelector('.mobile-bottom-nav__badge--dot')!;
    const item = dot.closest('.mobile-bottom-nav__item')!;
    expect(item.querySelector('.mobile-bottom-nav__label')?.textContent).toBe(zhCN.mobileNavigation.profile);
  });

  it('版本一致时不出现', () => {
    release.versionName = '1.0.0';
    const host = mount();
    expect(host.querySelectorAll('.mobile-bottom-nav__badge--dot')).toHaveLength(0);
  });

  it('手机浏览器（非 App）不出现', () => {
    userAgent = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36';
    const host = mount();
    expect(host.querySelectorAll('.mobile-bottom-nav__badge--dot')).toHaveLength(0);
  });

  it('已 dismiss 过该版本时不出现', () => {
    window.localStorage.setItem('light-note:android-update-dismissed', '1.0.1');
    resetAndroidAppUpdateForTest();
    const host = mount();
    expect(host.querySelectorAll('.mobile-bottom-nav__badge--dot')).toHaveLength(0);
  });

  it('红点是无数字的纯圆点，不复用待办的数字角标语义', () => {
    const host = mount();
    const dot = host.querySelector('.mobile-bottom-nav__badge--dot')!;
    expect(dot.textContent?.trim()).toBe('');
    // 屏幕阅读器要听到具体是什么事，而不是一个孤立的点
    expect(dot.getAttribute('aria-label')).toContain('1.0.1');
  });
});

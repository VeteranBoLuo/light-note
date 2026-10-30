import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, createApp, h, nextTick, shallowRef } from 'vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'personCenter', fullPath: '/personCenter' }),
  useRouter: () => ({ beforeEach: vi.fn(() => vi.fn()) }),
}));
vi.mock('@/config/mobileNavigation', () => ({ getMobileResourcePath: vi.fn(() => null) }));
vi.mock('@/composables/useMobileNavigationState', () => ({
  useMobileNavigationState: () => ({
    rememberResourceFromRoute: vi.fn(() => null),
    restoreResourceScroll: vi.fn(() => false),
    saveResourceScroll: vi.fn(),
  }),
}));
vi.mock('@/composables/useAndroidPullRefresh', () => ({ activePullIndicator: shallowRef(null) }));
vi.mock('./MobileTopBar.vue', () => ({ default: { template: '<header class="top-bar-stub" />' } }));
vi.mock('./MobileResourceTabs.vue', () => ({ default: { template: '<nav />' } }));
vi.mock('./MobileBottomNav.vue', () => ({ default: { template: '<nav class="bottom-nav-stub" />' } }));
vi.mock('./MobilePullRefreshIndicator.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/globalSearch/MobileGlobalSearchOverlay.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/home/navigation/RoutePendingIndicator.vue', () => ({
  default: { props: ['target', 'slow'], template: '<div class="pending-stub" :data-slow="String(slow)" />' },
}));

const state = shallowRef<null | { target: unknown; visible: boolean; slow: boolean }>(null);
vi.mock('@/utils/routePending', () => ({
  useRoutePending: () => ({
    target: computed(() => state.value?.target ?? null),
    visible: computed(() => Boolean(state.value?.visible)),
    slow: computed(() => Boolean(state.value?.slow)),
  }),
}));

const { default: MobileAppShell } = await import('./MobileAppShell.vue');

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  state.value = null;
});

function mountShell() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(
        MobileAppShell,
        { enabled: true, showTopBar: true, showTopSwitcher: false, showBottomNav: true },
        { default: () => h('section', { class: 'profile-page-stub' }) },
      ),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('MobileAppShell 导航等待态', () => {
  it('不在主布局下的“我的”页切换到未下载模块时，在内容区而不是顶栏或底栏里显示等待态', async () => {
    const host = mountShell();
    expect(host.querySelector('.pending-stub')).toBeNull();

    state.value = { target: { name: 'support' }, visible: false, slow: false };
    await nextTick();
    // 150ms 延迟前不出现，避免已缓存模块切换时闪一下。
    expect(host.querySelector('.pending-stub')).toBeNull();

    state.value = { target: { name: 'support' }, visible: true, slow: true };
    await nextTick();
    const layer = host.querySelector('.mobile-app-shell__content > .pending-stub');
    expect(layer).not.toBeNull();
    expect(layer?.getAttribute('data-slow')).toBe('true');
    expect(host.querySelector('.top-bar-stub .pending-stub, .bottom-nav-stub .pending-stub')).toBeNull();

    state.value = null;
    await nextTick();
    expect(host.querySelector('.pending-stub')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, createApp, h, nextTick, reactive, shallowRef } from 'vue';
import { isMobileShellRoute } from '@/config/mobileNavigation';

const route = reactive({ name: 'support', path: '/support', meta: {} as Record<string, unknown>, matched: [] });
const bookmark = reactive({ isMobile: false });
const state = shallowRef<null | { target: unknown; visible: boolean }>(null);

vi.mock('vue-router', () => ({
  useRoute: () => route,
  RouterView: { template: '<main class="view-stub" />' },
}));
vi.mock('@/store', () => ({ bookmarkStore: () => bookmark }));
vi.mock('@/components/home/navigation/Navigation.vue', () => ({ default: { template: '<nav />' } }));
vi.mock('@/components/home/navigation/RoutePendingIndicator.vue', () => ({
  default: { props: ['target', 'slow'], template: '<div class="pending-stub" />' },
}));
vi.mock('@/utils/routePending', () => ({
  useRoutePending: () => ({
    target: computed(() => state.value?.target ?? null),
    visible: computed(() => Boolean(state.value?.visible)),
    slow: computed(() => false),
  }),
}));

const { default: MainLayout } = await import('./index.vue');

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  state.value = null;
});

function mountLayout() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(MainLayout) });
  app.component('RouterView', { template: '<main class="view-stub" />' });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('主布局导航等待态', () => {
  it('PC 与无外壳的手机页由主布局显示；当前页由手机外壳承载时交给外壳，不重复显示', async () => {
    const host = mountLayout();
    state.value = { target: { name: 'settings' }, visible: true };
    await nextTick();
    expect(host.querySelector('.pending-stub')).not.toBeNull();

    bookmark.isMobile = true;
    await nextTick();
    expect(host.querySelector('.pending-stub')).not.toBeNull();

    route.meta = { mobileShell: 'today' };
    await nextTick();
    expect(host.querySelector('.pending-stub')).toBeNull();
  });

  it('外壳承载判断与根组件共用：只在手机布局且路由声明外壳时成立', () => {
    expect(isMobileShellRoute(true, { mobileShell: 'profile' })).toBe(true);
    expect(isMobileShellRoute(true, {})).toBe(false);
    expect(isMobileShellRoute(false, { mobileShell: 'profile' })).toBe(false);
  });
});

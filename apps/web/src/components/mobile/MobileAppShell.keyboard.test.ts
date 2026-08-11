import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type Ref } from 'vue';

const mocks = vi.hoisted(() => ({
  route: { name: 'communityChat', fullPath: '/community-chat' },
  beforeEach: vi.fn(() => vi.fn()),
  rememberResourceFromRoute: vi.fn(() => null),
  restoreResourceScroll: vi.fn(() => false),
  saveResourceScroll: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ beforeEach: mocks.beforeEach }),
}));
vi.mock('@/config/mobileNavigation', () => ({ getMobileResourcePath: vi.fn(() => null) }));
vi.mock('@/composables/useMobileNavigationState', () => ({
  useMobileNavigationState: () => ({
    rememberResourceFromRoute: mocks.rememberResourceFromRoute,
    restoreResourceScroll: mocks.restoreResourceScroll,
    saveResourceScroll: mocks.saveResourceScroll,
  }),
}));
vi.mock('@/composables/useAndroidPullRefresh', () => ({ activePullIndicator: ref(null) }));
vi.mock('./MobileTopBar.vue', () => ({ default: { template: '<header class="top-bar-stub" />' } }));
vi.mock('./MobileResourceTabs.vue', () => ({ default: { template: '<nav class="resource-tabs-stub" />' } }));
vi.mock('./MobileBottomNav.vue', () => ({ default: { template: '<nav class="bottom-nav-stub" />' } }));
vi.mock('./MobilePullRefreshIndicator.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/globalSearch/MobileGlobalSearchOverlay.vue', () => ({ default: { template: '<span />' } }));

const { default: MobileAppShell } = await import('./MobileAppShell.vue');

class MockVisualViewport extends EventTarget {
  height = 800;
  width = 390;
  offsetTop = 0;
}

let cleanup: (() => void) | undefined;
let viewport: MockVisualViewport;
let originalVisualViewport: PropertyDescriptor | undefined;
let originalInnerHeight: PropertyDescriptor | undefined;

function mountShell(options: { enabled?: Ref<boolean>; showTopBar?: boolean } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const enabled = options.enabled || ref(true);
  const app = createApp({
    render: () =>
      h(
        MobileAppShell,
        {
          enabled: enabled.value,
          showTopBar: options.showTopBar !== false,
          showTopSwitcher: false,
          showBottomNav: true,
        },
        { default: () => h('textarea', { class: 'composer-stub' }) },
      ),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, enabled };
}

beforeEach(() => {
  vi.clearAllMocks();
  viewport = new MockVisualViewport();
  originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  if (originalVisualViewport) Object.defineProperty(window, 'visualViewport', originalVisualViewport);
  else delete (window as any).visualViewport;
  if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
  vi.restoreAllMocks();
});

describe('MobileAppShell 软键盘可视高度', () => {
  it('输入控件聚焦且可视视口缩小时收起底栏，并把壳体限制到键盘上方', async () => {
    const { host } = mountShell();
    const textarea = host.querySelector<HTMLTextAreaElement>('.composer-stub');
    const shell = host.querySelector<HTMLElement>('.mobile-app-shell');
    expect(host.querySelector('.bottom-nav-stub')).not.toBeNull();

    textarea?.focus();
    viewport.height = 480;
    viewport.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(shell?.classList.contains('is-keyboard-open')).toBe(true);
    expect(shell?.style.getPropertyValue('--mobile-visible-viewport-height')).toBe('480px');
    expect(host.querySelector('.bottom-nav-stub')).toBeNull();

    textarea?.blur();
    viewport.height = 800;
    viewport.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(shell?.classList.contains('is-keyboard-open')).toBe(false);
    expect(shell?.style.getPropertyValue('--mobile-visible-viewport-height')).toBe('');
    expect(host.querySelector('.bottom-nav-stub')).not.toBeNull();
  });

  it('路由卸下并重新启用壳体时清空上一页残留的键盘视口', async () => {
    const enabled = ref(true);
    const { host } = mountShell({ enabled });
    const textarea = host.querySelector<HTMLTextAreaElement>('.composer-stub');

    textarea?.focus();
    viewport.height = 480;
    viewport.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(host.querySelector('.mobile-app-shell')?.classList.contains('is-keyboard-open')).toBe(true);

    enabled.value = false;
    await nextTick();
    textarea?.blur();
    viewport.height = 800;
    enabled.value = true;
    await nextTick();
    await nextTick();

    const restoredShell = host.querySelector<HTMLElement>('.mobile-app-shell');
    expect(restoredShell?.classList.contains('is-keyboard-open')).toBe(false);
    expect(restoredShell?.style.getPropertyValue('--mobile-visible-viewport-height')).toBe('');
    expect(host.querySelector('.bottom-nav-stub')).not.toBeNull();
  });

  it('聊天室可按路由关闭全局顶栏并把刷新槽顶边归零', async () => {
    const { host } = mountShell({ showTopBar: false });
    const shell = host.querySelector<HTMLElement>('.mobile-app-shell');

    expect(host.querySelector('.top-bar-stub')).toBeNull();
    expect(shell?.classList.contains('is-top-bar-hidden')).toBe(true);
  });
});

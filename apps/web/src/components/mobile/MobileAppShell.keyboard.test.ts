import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shellSource = readFileSync(resolve(process.cwd(), 'src/components/mobile/MobileAppShell.vue'), 'utf8');

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

async function flushViewportFrame() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await nextTick();
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
  it('对弱网下延迟挂载的资料页滚动容器执行有界重试，并让旧路由恢复请求失效', () => {
    expect(shellSource).toContain('SCROLL_RESTORE_RETRY_DELAYS = [80, 240, 640, 1280]');
    expect(shellSource).toContain('requestId !== scrollRestoreRequestId');
    expect(shellSource).toMatch(/restoreResourceScroll\(path\)[\s\S]*?window\.setTimeout/u);
  });

  it('输入控件聚焦后从键盘抬升初段逐帧限制壳体，并平滑隐藏仍保持挂载的底栏', async () => {
    const { host } = mountShell();
    const textarea = host.querySelector<HTMLTextAreaElement>('.composer-stub');
    const shell = host.querySelector<HTMLElement>('.mobile-app-shell');
    expect(host.querySelector('.bottom-nav-stub')).not.toBeNull();

    textarea?.focus();
    viewport.height = 770;
    viewport.dispatchEvent(new Event('resize'));
    await flushViewportFrame();

    expect(shell?.classList.contains('is-keyboard-open')).toBe(true);
    expect(shell?.style.getPropertyValue('--mobile-visible-viewport-height')).toBe('770px');
    expect(host.querySelector('.bottom-nav-stub')).not.toBeNull();
    const bottomNavWrapper = host.querySelector<HTMLElement>('.mobile-app-shell__bottom-nav');
    expect(bottomNavWrapper?.classList.contains('is-hidden')).toBe(false);
    expect(Number.parseFloat(shell?.style.getPropertyValue('--mobile-bottom-nav-visible-height') || '0')).toBeLessThan(
      56,
    );

    viewport.height = 480;
    viewport.dispatchEvent(new Event('resize'));
    await flushViewportFrame();
    expect(shell?.style.getPropertyValue('--mobile-visible-viewport-height')).toBe('480px');
    expect(bottomNavWrapper?.classList.contains('is-hidden')).toBe(true);

    textarea?.blur();
    viewport.height = 620;
    viewport.dispatchEvent(new Event('resize'));
    await flushViewportFrame();
    expect(shell?.classList.contains('is-keyboard-open')).toBe(true);
    expect(shell?.style.getPropertyValue('--mobile-visible-viewport-height')).toBe('620px');

    viewport.height = 800;
    viewport.dispatchEvent(new Event('resize'));
    await flushViewportFrame();

    expect(shell?.classList.contains('is-keyboard-open')).toBe(false);
    expect(shell?.style.getPropertyValue('--mobile-visible-viewport-height')).toBe('');
    expect(host.querySelector('.bottom-nav-stub')).not.toBeNull();
    expect(host.querySelector('.mobile-app-shell__bottom-nav')?.classList.contains('is-hidden')).toBe(false);
  });

  it('路由卸下并重新启用壳体时清空上一页残留的键盘视口', async () => {
    const enabled = ref(true);
    const { host } = mountShell({ enabled });
    const textarea = host.querySelector<HTMLTextAreaElement>('.composer-stub');

    textarea?.focus();
    viewport.height = 480;
    viewport.dispatchEvent(new Event('resize'));
    await flushViewportFrame();
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

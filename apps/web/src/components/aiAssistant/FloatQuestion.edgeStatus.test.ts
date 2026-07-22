import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import useAiAssistantStore, { type AiAssistantEdgeStatus } from '@/store/aiAssistant';
import useUserStore from '@/store/useUser';

vi.mock('@/store', async () => {
  const { default: useAiAssistantStore } = await import('@/store/aiAssistant');
  const { default: useUserStore } = await import('@/store/useUser');
  return {
    useAiAssistantStore,
    useUserStore,
    bookmarkStore: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
  };
});

vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/aiTelemetry.ts', () => ({ recordAiProductEvent: vi.fn(async () => undefined) }));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      name: 'BDrawer',
      props: { fullScreen: Boolean },
      setup: (props: { fullScreen?: boolean }, { slots }: { slots: Record<string, () => unknown> }) => () =>
        h('div', { class: 'mock-drawer', 'data-full-screen': String(props.fullScreen) }, slots['header-actions']?.()),
    },
  };
});
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { name: 'BModal', setup: () => () => null },
}));

const { default: FloatQuestion } = await import('./FloatQuestion.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  delete (window as Window & { __PRERENDER__?: boolean }).__PRERENDER__;
});

beforeEach(() => {
  localStorage.clear();
  (window as Window & { __PRERENDER__?: boolean }).__PRERENDER__ = true;
  if (!window.requestAnimationFrame) window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
});

function mountEdge(locale: 'zh-CN' | 'en-US' = 'zh-CN', aiDefaultFullscreen = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAiAssistantStore();
  const user = useUserStore();
  user.$patch({ preferences: { ...user.preferences, aiDefaultFullscreen } });
  store.switchConversation(
    {
      actorUserId: 'root-user',
      subjectUserId: 'user-a',
      adminContextMode: 'maintain',
      adminContextId: 'context-a',
    },
    '你好',
  );
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(FloatQuestion);
  app.use(pinia);
  app.use(
    createI18n({
      legacy: false,
      locale,
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  );
  app.directive('click-log', () => undefined);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, store, user };
}

function edgeButton(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>('button.ai-edge-trigger');
}

describe('FloatQuestion edge status contract', () => {
  it.each([
    ['generating', '正在生成回答'],
    ['completed', '回答已完成，打开查看'],
    ['needs_attention', '需要你的确认或选择，打开处理'],
    ['failed', '回答生成失败，打开查看或重试'],
  ] as const)('为 %s 提供克制的视觉状态和可读文本', async (status, text) => {
    const { host, store } = mountEdge();
    store.$patch({ edgeStatus: status as AiAssistantEdgeStatus });
    await nextTick();

    const button = edgeButton(host);
    expect(button?.dataset.status).toBe(status);
    expect(button?.querySelector(`.ai-edge-status--${status}`)).not.toBeNull();
    expect(button?.querySelector('[role="status"]')?.textContent).toContain(text);
    expect(button?.getAttribute('aria-label')).toContain(text);
    expect(button?.getAttribute('aria-busy')).toBe(status === 'generating' ? 'true' : 'false');
  });

  it('用户打开后确认已看见终态，但不会把进行中的请求提前确认掉', async () => {
    const { host, store } = mountEdge();
    const lease = store.beginRequest('assistant-edge');
    await nextTick();
    edgeButton(host)?.click();
    await nextTick();
    expect(store.edgeStatus).toBe('generating');

    store.finishRequest(lease, 'completed');
    await nextTick();
    await nextTick();
    await nextTick();
    expect(store.edgeStatus).toBe('idle');
    expect(edgeButton(host)?.querySelector('[role="status"]') ?? null).toBeNull();
  });

  it('英文状态同样进入 aria-label，不依赖颜色表达结果', async () => {
    const { host, store } = mountEdge('en-US');
    store.markEdgeNeedsAttention();
    await nextTick();

    expect(edgeButton(host)?.getAttribute('aria-label')).toContain('Your confirmation or choice is needed');
  });

  it('AI 快捷键在已打开时收起助手', async () => {
    const { host } = mountEdge();
    const openEvent = new KeyboardEvent('keydown', { key: '/', ctrlKey: true, cancelable: true });
    document.dispatchEvent(openEvent);
    await nextTick();

    expect(openEvent.defaultPrevented).toBe(true);
    expect(edgeButton(host)).toBeNull();

    const closeEvent = new KeyboardEvent('keydown', { key: '/', ctrlKey: true, cancelable: true });
    document.dispatchEvent(closeEvent);
    await nextTick();

    expect(closeEvent.defaultPrevented).toBe(true);
    expect(edgeButton(host)).not.toBeNull();
  });

  it('开启默认全屏偏好后，快捷键打开 AI 会使用全屏', async () => {
    const { host } = mountEdge('zh-CN', true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, cancelable: true }));
    await nextTick();

    expect(host.querySelector('.mock-drawer')?.getAttribute('data-full-screen')).toBe('true');
  });

  it('手动全屏或还原时同步默认全屏偏好', async () => {
    const { host, user } = mountEdge();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, cancelable: true }));
    await nextTick();

    const toggle = host.querySelector<HTMLButtonElement>('.ai-window-toggle[aria-label="最大化"]');
    toggle?.click();
    await nextTick();
    expect(host.querySelector('.mock-drawer')?.getAttribute('data-full-screen')).toBe('true');
    expect(user.preferences.aiDefaultFullscreen).toBe(true);

    host.querySelector<HTMLButtonElement>('.ai-window-toggle[aria-label="还原窗口"]')?.click();
    await nextTick();
    expect(host.querySelector('.mock-drawer')?.getAttribute('data-full-screen')).toBe('false');
    expect(user.preferences.aiDefaultFullscreen).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { MOBILE_OVERLAY_HISTORY_STATE_KEY, resetMobileOverlayHistoryForTests } from '@/utils/mobileOverlayHistory';
import AiSourceCards from './AiSourceCards.vue';
import type { AiSource } from './aiSourceNavigation';

const routerPush = vi.fn(() => Promise.resolve());

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/api/aiTelemetry', () => ({
  recordAiProductEvent: vi.fn(() => Promise.resolve()),
}));

let cleanup: (() => void) | undefined;

const sources: AiSource[] = [
  { type: 'note', id: 'note-1', title: '第一篇笔记', target: 'note-detail' },
  { type: 'note', id: 'note-2', title: '第二篇笔记', target: 'note-detail' },
  { type: 'note', id: 'note-3', title: '第三篇笔记', target: 'note-detail' },
  { type: 'note', id: 'note-4', title: '第四篇笔记', target: 'note-detail' },
];

function mountCards(isMobile: boolean, sourceItems: AiSource[] = sources) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(AiSourceCards, { sources: sourceItems, isMobile });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  );
  app.component('OriginalIcon', { render: () => h('span', { 'data-test-icon': '' }) });
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('AiSourceCards', () => {
  beforeEach(() => {
    resetMobileOverlayHistoryForTests();
    routerPush.mockClear();
    window.history.replaceState({}, '', '/workbenches');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    resetMobileOverlayHistoryForTests();
    vi.restoreAllMocks();
  });

  it('移动端从全部来源打开站内资源时，等待弹框 history 出栈后再跳转', async () => {
    const host = mountCards(true);
    host.querySelector<HTMLButtonElement>('button.ai-sources__more')?.click();
    await nextTick();
    await nextTick();

    expect(typeof window.history.state?.[MOBILE_OVERLAY_HISTORY_STATE_KEY]).toBe('string');
    document.querySelector<HTMLButtonElement>('.ai-source-list__item')?.click();
    await nextTick();

    expect(window.history.back).toHaveBeenCalledOnce();
    expect(routerPush).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await nextTick();
    await Promise.resolve();

    expect(routerPush).toHaveBeenCalledOnce();
    expect(routerPush).toHaveBeenCalledWith('/noteLibrary/note-1');
  });

  it('移动端外层来源不经过弹框 history，保持直接跳转', async () => {
    const host = mountCards(true);
    host.querySelector<HTMLButtonElement>('button.ai-sources__compact')?.click();
    await nextTick();

    expect(window.history.back).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith('/noteLibrary/note-1');
  });

  it('移动端从全部来源打开外部网页时保持同步打开，避免丢失用户激活状态', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const webSources: AiSource[] = Array.from({ length: 4 }, (_, index) => ({
      type: 'web',
      id: `web-${index + 1}`,
      title: `网页 ${index + 1}`,
      target: 'web-url',
      url: `https://example.com/${index + 1}`,
    }));
    const host = mountCards(true, webSources);
    host.querySelector<HTMLButtonElement>('button.ai-sources__more')?.click();
    await nextTick();
    await nextTick();

    document.querySelector<HTMLButtonElement>('.ai-source-list__item')?.click();
    await nextTick();

    expect(open).toHaveBeenCalledWith('https://example.com/1', '_blank', 'noopener,noreferrer');
    expect(window.history.back).toHaveBeenCalledOnce();
  });
});

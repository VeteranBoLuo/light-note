import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import ResourcePickerPanel from './ResourcePickerPanel.vue';

vi.mock('@/api/search', () => ({
  fetchGlobalSearch: vi.fn().mockResolvedValue({ items: [] }),
}));

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

describe('ResourcePickerPanel 键盘导航', () => {
  it('从第一项向上循环到最后一项时，同步滚动结果容器显示高亮项', async () => {
    const panelRef = ref<{ moveActive: (offset: number) => Promise<void> } | null>(null);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(ResourcePickerPanel, {
          ref: panelRef,
          showSearch: false,
          pinnedItems: [
            { type: 'bookmark', id: '1', title: '第一项' },
            { type: 'bookmark', id: '2', title: '第二项' },
            { type: 'bookmark', id: '3', title: '最后一项' },
          ],
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await nextTick();

    const container = host.querySelector<HTMLElement>('.resource-picker-panel__results');
    const items = host.querySelectorAll<HTMLElement>('.resource-picker-panel__item');
    expect(container).not.toBeNull();
    expect(items).toHaveLength(3);

    const scrollTo = vi.fn();
    Object.defineProperties(container!, {
      scrollTop: { configurable: true, writable: true, value: 20 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    vi.spyOn(container!, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 200 } as DOMRect);
    vi.spyOn(items[2]!, 'getBoundingClientRect').mockReturnValue({ top: 220, bottom: 250 } as DOMRect);

    await panelRef.value?.moveActive(-1);

    expect(items[2]?.classList.contains('is-active')).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 70, behavior: 'auto' });
  });
});

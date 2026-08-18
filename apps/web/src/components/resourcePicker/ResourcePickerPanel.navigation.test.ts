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
    app.component('OriginalIcon', { setup: () => () => h('span') });
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

    // 程序滚动会让静止鼠标下方换成另一项，此时浏览器可能派发 mouseenter；
    // 只有用户真正移动鼠标时，才允许鼠标接管键盘高亮。
    items[1]?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await nextTick();
    expect(items[2]?.classList.contains('is-active')).toBe(true);

    items[1]?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await nextTick();
    expect(items[1]?.classList.contains('is-active')).toBe(true);
  });

  it('单篇笔记不再显示冗余说明，且单篇与目录范围保持独立禁用状态', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(ResourcePickerPanel, {
          showSearch: false,
          includeNoteScopes: true,
          selectedResourceKeys: ['note:note-1'],
          selectedScopeKeys: [],
          pinnedItems: [{ type: 'note', id: 'note-1', title: 'pc', path: '开发文档', descendantCount: 0 }],
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.component('OriginalIcon', { setup: () => () => h('span') });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await Promise.resolve();
    await nextTick();

    const resource = host.querySelector<HTMLButtonElement>(
      '.resource-picker-panel__item:not(.resource-picker-panel__item--scope)',
    );
    const scope = host.querySelector<HTMLButtonElement>('.resource-picker-panel__item--scope');
    expect(resource?.disabled).toBe(true);
    expect(scope?.disabled).toBe(false);
    expect(host.textContent).not.toContain('仅引用这一篇笔记');
    expect(scope?.textContent).toContain('当前页面及其 0 个子页面');
  });
});

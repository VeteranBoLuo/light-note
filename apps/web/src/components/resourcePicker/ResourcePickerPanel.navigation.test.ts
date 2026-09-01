import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import zhCN from '@/i18n/locales/zh-CN';
import { fetchGlobalSearch } from '@/api/search';
import ResourcePickerPanel from './ResourcePickerPanel.vue';

const componentSource = readFileSync(
  resolve(process.cwd(), 'src/components/resourcePicker/ResourcePickerPanel.vue'),
  'utf8',
);

vi.mock('@/api/search', () => ({
  fetchGlobalSearch: vi.fn().mockResolvedValue({ items: [] }),
}));

const fetchGlobalSearchMock = vi.mocked(fetchGlobalSearch);

let cleanup: (() => void) | undefined;

function installTestApp(app: ReturnType<typeof createApp>) {
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('auto-scrollbar', {});
  app.component('svg-icon', { setup: () => () => h('span') });
}

beforeEach(() => {
  fetchGlobalSearchMock.mockReset();
  fetchGlobalSearchMock.mockResolvedValue({ items: [], groups: [], total: 0, hasMore: false } as any);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

describe('ResourcePickerPanel 键盘导航', () => {
  it('搜索框显示与内联宽度使用独立开关，不能从彼此反推', () => {
    expect(componentSource).toContain('v-if="showSearch"');
    expect(componentSource).toContain("'is-inline': inline");
    expect(componentSource).toContain("'has-search': showSearch");
    expect(componentSource).toMatch(/\.resource-picker-panel\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none/);
    expect(componentSource).toMatch(
      /\.resource-picker-panel\.is-inline\s*\{[\s\S]*?width:\s*320px[\s\S]*?max-width:\s*min\(360px/,
    );
  });

  it('关键词搜索重置面板滚动，类型切换可恢复语义锚点并稳定页面滚动调用方', () => {
    expect(componentSource).toContain('function resetResultScroll(');
    expect(componentSource).toContain('if (props.pageScroll) return;');
    expect(componentSource).toContain('function beginPageScrollTransition()');
    expect(componentSource).toContain('function finishPageScrollTransition()');
    expect(componentSource).toContain('pageScrollHoldHeight');
    expect(componentSource).toContain('overflow-anchor: none');
    expect(componentSource).toContain('restoreScrollTop(snapshot.container, snapshot.scrollTop)');
    expect(componentSource).toContain('function captureScrollAnchor()');
    expect(componentSource).toContain('function prepareScrollAnchor(');
    expect(componentSource).toContain('function restorePreparedScrollAnchor()');
    expect(componentSource).toContain('data-scroll-anchor');
    expect(componentSource).toContain('v-auto-scrollbar');
    expect(componentSource).toContain('virtualListRef.value?.scrollToTop()');
    expect(componentSource).toContain('resultsRef.value.scrollTop = 0');
  });

  it('筛选切换后优先回到同一资料，而不是只恢复脆弱的像素位置', async () => {
    const allowedTypes = ref<Array<'bookmark' | 'note'>>(['bookmark', 'note']);
    const panelRef = ref<{
      captureScrollAnchor: () => { key: string; index: number; offset: number } | null;
      prepareScrollAnchor: (anchor: { key: string; index: number; offset: number }) => void;
    } | null>(null);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(ResourcePickerPanel, {
          ref: panelRef,
          showSearch: false,
          allowedTypes: allowedTypes.value,
          pinnedItems: [
            { type: 'bookmark', id: '1', title: '第一项' },
            { type: 'bookmark', id: '2', title: '第二项' },
            { type: 'bookmark', id: '3', title: '第三项' },
          ],
        }),
    });
    installTestApp(app);
    app.component('OriginalIcon', { setup: () => () => h('span') });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await nextTick();

    const results = host.querySelector<HTMLElement>('.resource-picker-panel__results')!;
    const entries = host.querySelectorAll<HTMLElement>('[data-scroll-anchor]');
    Object.defineProperty(results, 'clientHeight', { configurable: true, value: 120 });
    entries.forEach((entry, index) => {
      Object.defineProperty(entry, 'offsetTop', { configurable: true, value: index * 40 });
    });
    results.scrollTop = 85;
    const anchor = panelRef.value?.captureScrollAnchor();
    expect(anchor).toEqual({ key: 'resource:bookmark:3', index: 2, offset: 5 });

    results.scrollTop = 0;
    panelRef.value?.prepareScrollAnchor(anchor!);
    allowedTypes.value = ['bookmark'];
    await nextTick();
    await nextTick();
    await vi.waitFor(() => expect(results.scrollTop).toBe(85));
  });

  it('铺满弹框时可以不显示搜索框，内联模式也不会被搜索框状态隐式开启', async () => {
    const showSearch = ref(false);
    const inline = ref(false);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(ResourcePickerPanel, {
          showSearch: showSearch.value,
          inline: inline.value,
          pinnedItems: [{ type: 'bookmark', id: '1', title: '第一项' }],
        }),
    });
    installTestApp(app);
    app.component('OriginalIcon', { setup: () => () => h('span') });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await nextTick();

    const panel = host.querySelector('.resource-picker-panel');
    expect(host.querySelector('input')).toBeNull();
    expect(panel?.classList.contains('is-inline')).toBe(false);
    expect(panel?.classList.contains('has-search')).toBe(false);

    inline.value = true;
    await nextTick();
    expect(panel?.classList.contains('is-inline')).toBe(true);
    expect(host.querySelector('input')).toBeNull();

    inline.value = false;
    showSearch.value = true;
    await nextTick();
    expect(panel?.classList.contains('is-inline')).toBe(false);
    expect(panel?.classList.contains('has-search')).toBe(true);
    expect(host.querySelector('input')).not.toBeNull();
  });

  it('搜索框消费 Escape，只请求关闭当前资源层，不让事件抵达背景层', async () => {
    const onClose = vi.fn();
    const onDocumentKeydown = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    document.addEventListener('keydown', onDocumentKeydown);
    const app = createApp({
      render: () =>
        h(ResourcePickerPanel, {
          showSearch: true,
          pinnedItems: [{ type: 'bookmark', id: '1', title: '第一项' }],
          onClose,
        }),
    });
    installTestApp(app);
    app.component('OriginalIcon', { setup: () => () => h('span') });
    app.mount(host);
    cleanup = () => {
      document.removeEventListener('keydown', onDocumentKeydown);
      app.unmount();
      host.remove();
    };
    await nextTick();

    const input = host.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input?.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDocumentKeydown).not.toHaveBeenCalled();
  });

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
    installTestApp(app);
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

  it('单篇笔记与包含子页面的目录范围保持独立禁用状态', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(ResourcePickerPanel, {
          showSearch: false,
          includeNoteScopes: true,
          selectedResourceKeys: ['note:note-1'],
          selectedScopeKeys: [],
          pinnedItems: [{ type: 'note', id: 'note-1', title: 'pc', path: '开发文档', descendantCount: 2 }],
        }),
    });
    installTestApp(app);
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
    expect(scope?.textContent).toContain('当前页面及其 2 个子页面');
  });

  it('多选模式允许再次点击已选项取消，并可一次加入当前未选结果', async () => {
    const onDeselect = vi.fn();
    const onSelectMany = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(ResourcePickerPanel, {
          showSearch: false,
          multiSelect: true,
          selectedResourceKeys: ['bookmark:1'],
          pinnedItems: [
            { type: 'bookmark', id: '1', title: '已选资料' },
            { type: 'bookmark', id: '2', title: '待选资料' },
          ],
          onDeselect,
          onSelectMany,
        }),
    });
    installTestApp(app);
    app.component('OriginalIcon', { setup: () => () => h('span') });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await nextTick();

    const items = host.querySelectorAll<HTMLButtonElement>('.resource-picker-panel__item');
    items[0]?.click();
    expect(onDeselect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));

    host.querySelector<HTMLButtonElement>('.resource-picker-panel__batch button')?.click();
    expect(onSelectMany).toHaveBeenCalledWith([expect.objectContaining({ id: '2' })]);
  });

  it('首次搜索失败显示独立错误态和就地重试，不伪装成空结果', async () => {
    fetchGlobalSearchMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ items: [], groups: [], total: 0, hasMore: false } as any);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ render: () => h(ResourcePickerPanel, { showSearch: true }) });
    installTestApp(app);
    app.component('OriginalIcon', { setup: () => () => h('span') });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await vi.waitFor(() => expect(host.textContent).toContain('资料暂时无法读取，请重试。'));
    expect(host.textContent).not.toContain('没有找到可添加的资源');
    host.querySelector<HTMLButtonElement>('.resource-picker-panel__load-error button')?.click();
    await vi.waitFor(() => {
      expect(fetchGlobalSearchMock).toHaveBeenCalledTimes(2);
      expect(host.textContent).not.toContain('资料暂时无法读取，请重试。');
    });
  });

  it('单类型完整浏览使用 BVirtualList，不一次挂载全部结果', async () => {
    fetchGlobalSearchMock.mockResolvedValueOnce({
      keyword: '',
      items: Array.from({ length: 50 }, (_, index) => ({
        type: 'note',
        id: `note-${index}`,
        title: `笔记 ${index}`,
      })),
      groups: [],
      total: 50,
      typeTotals: { note: 50 },
      hasMore: false,
      nextCursor: null,
    } as any);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(ResourcePickerPanel, {
          showSearch: false,
          allowedTypes: ['note'],
          exhaustiveSingleType: true,
          multiSelect: true,
          pageScroll: true,
        }),
    });
    installTestApp(app);
    app.component('OriginalIcon', { setup: () => () => h('span') });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await Promise.resolve();
    await nextTick();
    await nextTick();

    expect(fetchGlobalSearchMock).toHaveBeenCalledWith(
      '',
      40,
      true,
      expect.objectContaining({ paginationMode: 'ordered', types: ['note'] }),
    );
    expect(host.querySelector('.b-virtual-list')).not.toBeNull();
    expect(host.querySelector('.resource-picker-panel')?.classList.contains('is-page-scroll')).toBe(true);
    expect(host.querySelector('.b-virtual-list')?.classList.contains('is-ancestor-scroll')).toBe(true);
    expect(host.querySelectorAll('.resource-picker-panel__item').length).toBeLessThan(50);
    expect(host.textContent).toContain('已加载 50/50 项');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';

const bookmarkState = reactive({
  isMobile: true,
  isTablet: false,
  isDesktop: false,
  isMobileDevice: true,
  screenWidth: 390,
});
const headingElements = [document.createElement('h2'), document.createElement('h3')];
const noteState = reactive({
  headings: [
    { level: 2, text: '概览', element: headingElements[0] },
    { level: 5, text: '深入细节', element: headingElements[1] },
  ],
  generateTOC: vi.fn(),
});
const scrollIntoContainer = vi.fn();
const scrollNearestIntoContainer = vi.fn();

vi.mock('@/store', () => ({
  bookmarkStore: () => bookmarkState,
  noteStore: () => noteState,
}));
vi.mock('@/utils/zoom.ts', () => ({ scrollIntoContainer, scrollNearestIntoContainer }));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    name: 'BDrawer',
    props: {
      open: Boolean,
      placement: String,
      height: String,
      title: String,
    },
    emits: ['close'],
    setup(
      props: { open: boolean; placement?: string; height?: string; title?: string },
      {
        emit,
        slots,
      }: {
        emit: (name: 'close') => void;
        slots: Record<string, () => unknown>;
      },
    ) {
      return () =>
        props.open
          ? h(
              'section',
              {
                class: 'mock-drawer',
                'data-placement': props.placement,
                'data-height': props.height,
                'data-title': props.title,
              },
              [
                h('button', { class: 'mock-close', onClick: () => emit('close') }),
                slots['header-actions']?.(),
                slots.default?.(),
              ],
            )
          : null;
    },
  },
}));

const { default: Catalog } = await import('./Catalog.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  bookmarkState.isMobile = true;
  bookmarkState.isTablet = false;
  bookmarkState.isDesktop = false;
  bookmarkState.isMobileDevice = true;
  bookmarkState.screenWidth = 390;
  noteState.headings = [
    { level: 2, text: '概览', element: headingElements[0] },
    { level: 5, text: '深入细节', element: headingElements[1] },
  ];
  noteState.generateTOC.mockClear();
  scrollIntoContainer.mockClear();
  scrollNearestIntoContainer.mockClear();
});

function mountCatalog(options: { noteType?: string; drawerOpen?: boolean } = {}) {
  const markdownHeadingClick = vi.fn();
  const close = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () =>
      h(Catalog, {
        content: '# 内容',
        noteType: options.noteType || 'markdown',
        drawerOpen: options.drawerOpen ?? true,
        onMarkdownHeadingClick: markdownHeadingClick,
        onClose: close,
      }),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          noteDetail: {
            catalogTitle: '笔记目录',
            catalogClose: '关闭笔记目录',
            catalogCount: '共 {count} 个标题',
            catalogEmpty: '正文中还没有标题',
            catalogUntitled: '未命名标题',
          },
        },
      },
    }),
  );
  app.directive('click-log', () => undefined);
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, markdownHeadingClick, close };
}

describe('Catalog responsive outline', () => {
  it('移动端使用底部抽屉、大触控项和标题数量，点击后定位并自动收起', async () => {
    const { host, markdownHeadingClick, close } = mountCatalog();
    await nextTick();

    const drawer = host.querySelector<HTMLElement>('.mock-drawer');
    expect(drawer?.dataset.placement).toBe('bottom');
    expect(drawer?.dataset.height).toBe('min(72dvh, 620px)');
    expect(drawer?.dataset.title).toBe('笔记目录');
    expect(host.textContent).toContain('共 2 个标题');

    const items = host.querySelectorAll<HTMLButtonElement>('.toc-item');
    expect(items).toHaveLength(2);
    items[1].click();
    await nextTick();
    expect(markdownHeadingClick).toHaveBeenCalledWith(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('抽屉关闭入口向父级回传关闭事件', async () => {
    const { host, close } = mountCatalog();
    host.querySelector<HTMLButtonElement>('.mock-close')?.click();
    await nextTick();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('中等宽度和平板布局复用底部目录抽屉，点击标题后同样收起', async () => {
    bookmarkState.isMobile = false;
    bookmarkState.isTablet = true;
    bookmarkState.isDesktop = false;
    bookmarkState.isMobileDevice = true;
    bookmarkState.screenWidth = 975;
    const { host, markdownHeadingClick, close } = mountCatalog();
    await nextTick();

    expect(host.querySelector('.mock-drawer')).not.toBeNull();
    host.querySelectorAll<HTMLButtonElement>('.toc-item')[0].click();
    await nextTick();
    expect(markdownHeadingClick).toHaveBeenCalledWith(0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('桌面端保留侧边目录，并把过深层级缩进限制在三层', async () => {
    bookmarkState.isMobile = false;
    bookmarkState.isTablet = false;
    bookmarkState.isDesktop = true;
    bookmarkState.isMobileDevice = false;
    bookmarkState.screenWidth = 1440;
    const { host } = mountCatalog({ noteType: 'html', drawerOpen: false });
    await nextTick();
    const items = host.querySelectorAll<HTMLElement>('.toc-item');
    expect(items[0].style.getPropertyValue('--toc-indent')).toBe('0px');
    expect(items[1].style.getPropertyValue('--toc-indent')).toBe('48px');

    const scrollRoot = document.createElement('div');
    scrollRoot.className = 'note-editor-scroll';
    document.body.append(scrollRoot);
    cleanup = (() => {
      const previous = cleanup;
      return () => {
        previous?.();
        scrollRoot.remove();
      };
    })();
    items[0].click();
    expect(scrollIntoContainer).toHaveBeenCalledWith(scrollRoot, headingElements[0], 8);
  });
});

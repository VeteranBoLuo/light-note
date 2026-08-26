import { createApp, defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import type { NoteTreeItem } from '@/types/noteTree';

const mocks = vi.hoisted(() => ({ scrollNearestIntoContainer: vi.fn() }));

vi.mock('@/utils/zoom', () => ({ scrollNearestIntoContainer: mocks.scrollNearestIntoContainer }));
vi.mock('@/composables/useNoteTree', () => ({ NOTE_TREE_ROOT_KEY: '__light_note_root__' }));
vi.mock('@/components/noteLibrary/tree/NoteTreeRow.vue', () => ({
  default: defineComponent({
    name: 'NoteTreeRowStub',
    props: {
      node: { type: Object, required: true },
      activePageId: { type: String, default: '' },
    },
    setup(props) {
      return () =>
        h('div', {
          class: ['note-tree-row', props.activePageId === (props.node as NoteTreeItem).id ? 'is-active' : ''],
          'data-note-tree-node-id': (props.node as NoteTreeItem).id,
        });
    },
  }),
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: defineComponent({
    name: 'BButtonStub',
    setup(_props, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.());
    },
  }),
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: defineComponent({ name: 'BInputStub', setup: () => () => h('div') }),
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: defineComponent({ name: 'BTabsStub', setup: () => () => h('div') }),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: defineComponent({ name: 'SvgIconStub', setup: () => () => h('i') }),
}));

const { default: NoteLibrarySidebar } = await import('./NoteLibrarySidebar.vue');

const node = (id: string): NoteTreeItem => ({
  id,
  parentId: null,
  title: id,
  type: 'html',
  childCount: 0,
  hasChildren: false,
  isTop: false,
  sort: 0,
});

describe('NoteLibrarySidebar 当前预览定位', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    mocks.scrollNearestIntoContainer.mockReset();
    document.body.innerHTML = '';
  });

  function mountSidebar(options: {
    activeId: Ref<string | null>;
    mode?: Ref<'directory' | 'outline'>;
    searchActive?: Ref<boolean>;
    loadingKeys?: Ref<Set<string>>;
    treeScrollTop?: Ref<number>;
    surface?: 'library' | 'detail';
  }) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const children = ref<Record<string, NoteTreeItem[]>>({ __light_note_root__: [] });
    const mode = options.mode || ref<'directory' | 'outline'>('directory');
    const app = createApp({
      render: () =>
        h(NoteLibrarySidebar, {
          mode: mode.value,
          directoryEnabled: true,
          outlineEnabled: true,
          surface: options.surface || 'library',
          activePageId: options.activeId.value,
          treeScrollTop: options.treeScrollTop?.value || 0,
          searchActive: options.searchActive?.value || false,
          childrenByParent: children.value,
          expandedIds: new Set<string>(),
          loadingKeys: options.loadingKeys?.value || new Set<string>(),
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.directive('auto-scrollbar', {});
    app.mount(host);
    cleanup = () => app.unmount();
    return { children, host, mode };
  }

  it('预览笔记时隐藏根浏览边框，关闭预览后恢复', async () => {
    const activeId = ref<string | null>(null);
    const { host } = mountSidebar({ activeId });
    await nextTick();

    const rootClasses = () => host.querySelector('.note-tree-root')!.classList;
    expect(rootClasses().contains('is-browse-scope')).toBe(true);

    activeId.value = 'leaf-note';
    await nextTick();
    expect(rootClasses().contains('is-browse-scope')).toBe(false);

    activeId.value = null;
    await nextTick();
    expect(rootClasses().contains('is-browse-scope')).toBe(true);
  });

  it('目标节点异步挂载后只定位左侧树中的最新选中行', async () => {
    const activeId = ref<string | null>('old-note');
    const { children, host } = mountSidebar({ activeId });
    await nextTick();
    expect(mocks.scrollNearestIntoContainer).not.toHaveBeenCalled();

    activeId.value = 'leaf-note';
    children.value = { __light_note_root__: [node('old-note'), node('leaf-note')] };
    await nextTick();
    await nextTick();

    const container = host.querySelector<HTMLElement>('.note-tree-scroll');
    const activeRow = host.querySelector<HTMLElement>('[data-note-tree-node-id="leaf-note"]');
    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledTimes(1);
    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledWith(container, activeRow, 'auto');
  });

  it('详情页刷新后节点延迟挂载时也会定位当前笔记', async () => {
    const activeId = ref<string | null>('css-note');
    const { children, host } = mountSidebar({ activeId, surface: 'detail' });
    await nextTick();
    expect(mocks.scrollNearestIntoContainer).not.toHaveBeenCalled();

    children.value = { __light_note_root__: [node('css-note')] };
    await nextTick();
    await nextTick();

    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledWith(
      host.querySelector('.note-tree-scroll'),
      host.querySelector('[data-note-tree-node-id="css-note"]'),
      'auto',
    );
  });

  it('刷新恢复期间等待所有异步分支稳定后再定位当前笔记', async () => {
    const activeId = ref<string | null>('pear-note');
    const loadingKeys = ref(new Set(['__light_note_root__', 'drawing-parent']));
    const { children, host } = mountSidebar({ activeId, loadingKeys, surface: 'detail' });
    children.value = { __light_note_root__: [node('pear-note')] };
    await nextTick();
    await nextTick();
    expect(mocks.scrollNearestIntoContainer).not.toHaveBeenCalled();

    loadingKeys.value = new Set();
    await nextTick();
    await nextTick();

    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledTimes(1);
    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledWith(
      host.querySelector('.note-tree-scroll'),
      host.querySelector('[data-note-tree-node-id="pear-note"]'),
      'auto',
    );
  });

  it('详情页先恢复原滚动位置，再让当前笔记定位做最终校正', async () => {
    const activeId = ref<string | null>('leaf-note');
    const treeScrollTop = ref(240);
    const observedScrollTops: number[] = [];
    mocks.scrollNearestIntoContainer.mockImplementation((container: HTMLElement) => {
      observedScrollTops.push(container.scrollTop);
    });
    const { children, host } = mountSidebar({ activeId, treeScrollTop, surface: 'detail' });
    children.value = { __light_note_root__: [node('leaf-note')] };
    await nextTick();
    await nextTick();

    expect(host.querySelector<HTMLElement>('.note-tree-scroll')?.scrollTop).toBe(240);
    expect(observedScrollTops).toEqual([240]);
  });

  it('新建完成后当前 ID 变化时等待新节点插入并定位', async () => {
    const activeId = ref<string | null>('existing-note');
    const { children, host } = mountSidebar({ activeId, surface: 'detail' });
    children.value = { __light_note_root__: [node('existing-note')] };
    await nextTick();
    await nextTick();
    mocks.scrollNearestIntoContainer.mockReset();

    activeId.value = 'created-note';
    await nextTick();
    expect(mocks.scrollNearestIntoContainer).not.toHaveBeenCalled();

    children.value = { __light_note_root__: [node('existing-note'), node('created-note')] };
    await nextTick();
    await nextTick();

    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledTimes(1);
    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledWith(
      host.querySelector('.note-tree-scroll'),
      host.querySelector('[data-note-tree-node-id="created-note"]'),
      'auto',
    );
  });

  it('大纲态不抢滚动，回到页面目录后再完成待定位', async () => {
    const activeId = ref<string | null>('leaf-note');
    const mode = ref<'directory' | 'outline'>('outline');
    const { children, host } = mountSidebar({ activeId, mode });
    children.value = { __light_note_root__: [node('leaf-note')] };
    await nextTick();
    await nextTick();
    expect(mocks.scrollNearestIntoContainer).not.toHaveBeenCalled();

    mode.value = 'directory';
    await nextTick();
    await nextTick();

    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledWith(
      host.querySelector('.note-tree-scroll'),
      host.querySelector('[data-note-tree-node-id="leaf-note"]'),
      'auto',
    );
  });

  it('搜索态延后到普通目录定位，关闭预览会取消尚未挂载的目标', async () => {
    const activeId = ref<string | null>('leaf-note');
    const searchActive = ref(true);
    const { children } = mountSidebar({ activeId, searchActive });
    children.value = { __light_note_root__: [node('leaf-note')] };
    await nextTick();
    await nextTick();
    expect(mocks.scrollNearestIntoContainer).not.toHaveBeenCalled();

    searchActive.value = false;
    await nextTick();
    await nextTick();
    expect(mocks.scrollNearestIntoContainer).toHaveBeenCalledTimes(1);

    mocks.scrollNearestIntoContainer.mockReset();
    activeId.value = 'pending-note';
    await nextTick();
    activeId.value = null;
    children.value = { __light_note_root__: [node('leaf-note'), node('pending-note')] };
    await nextTick();
    await nextTick();
    expect(mocks.scrollNearestIntoContainer).not.toHaveBeenCalled();
  });
});

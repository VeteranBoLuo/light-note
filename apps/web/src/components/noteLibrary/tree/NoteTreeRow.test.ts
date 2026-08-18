import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import icon from '@/config/icon';

vi.mock('@/composables/useNoteTree', () => ({ NOTE_TREE_ROOT_KEY: '__light_note_root__' }));

vi.mock('@/components/base/BasicComponents/BActionMenu.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'BActionMenuStub',
      props: {
        items: { type: Array, default: () => [] },
        triggers: { type: Array, default: () => [] },
        disabled: Boolean,
      },
      emits: ['select'],
      setup(props: { items: Array<Record<string, unknown>>; triggers: string[]; disabled: boolean }, { emit, slots }) {
        return () =>
          h(
            'div',
            {
              class: 'action-menu-stub',
              'data-triggers': props.triggers.join(','),
              'data-disabled': String(props.disabled),
            },
            [
              slots.default?.(),
              ...props.items.map((item, index) =>
                item.divider
                  ? h('hr', { key: `divider-${index}` })
                  : h(
                      'button',
                      {
                        key: String(item.key || item.label || index),
                        class: ['action-menu-option', item.danger ? 'action-menu-option--danger' : ''],
                        disabled: props.disabled,
                        onClick: () => emit('select', item.key, 'hover'),
                      },
                      String(item.label || ''),
                    ),
              ),
            ],
          );
      },
    }),
  };
});
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({
  default: { name: 'BTooltipStub', template: '<span><slot /></span>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: {
    name: 'SvgIconStub',
    props: { src: { type: String, default: '' } },
    template: '<i :data-src="src" aria-hidden="true" />',
  },
}));

const { default: NoteTreeRow } = await import('./NoteTreeRow.vue');

describe('NoteTreeRow 显式页面操作', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('单击标题只上抛页面选择，展开与管理操作保持独立', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const events = {
      select: vi.fn(),
      open: vi.fn(),
      create: vi.fn(),
      attach: vi.fn(),
      toggleTop: vi.fn(),
      rename: vi.fn(),
      move: vi.fn(),
      copyLink: vi.fn(),
      share: vi.fn(),
      delete: vi.fn(),
      dragStart: vi.fn(),
      dragEnd: vi.fn(),
    };
    const node = {
      id: 'note-1',
      parentId: null,
      title: '产品设计',
      childCount: 0,
      hasChildren: false,
      isTop: true,
      sort: 10,
    };
    const app = createApp({
      render: () =>
        h(NoteTreeRow, {
          node,
          depth: 0,
          currentParentId: null,
          childrenByParent: {},
          expandedIds: new Set<string>(),
          loadingKeys: new Set<string>(),
          onSelect: events.select,
          onOpen: events.open,
          onCreate: events.create,
          onAttach: events.attach,
          onToggleTop: events.toggleTop,
          onRename: events.rename,
          onMove: events.move,
          onCopyLink: events.copyLink,
          onShare: events.share,
          onDelete: events.delete,
          onDragStart: events.dragStart,
          onDragEnd: events.dragEnd,
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    const title = host.querySelector<HTMLButtonElement>('.note-tree-title')!;
    title.click();
    title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(events.open).toHaveBeenCalledWith('note-1');
    expect(events.select).not.toHaveBeenCalled();
    expect(host.querySelector('.note-tree-action[aria-label="打开正文"]')).toBeNull();
    expect(host.querySelector('.note-tree-action[aria-label="更多"]')).toBeNull();
    expect(host.querySelector('.action-menu-stub')?.getAttribute('data-triggers')).toBe('hover,contextmenu');

    const options = [...host.querySelectorAll<HTMLButtonElement>('.action-menu-option')];
    const clickOption = (label: string) => {
      const option = options.find((item) => item.textContent?.includes(label));
      expect(option).toBeDefined();
      option!.click();
    };
    clickOption(zhCN.note.newChildPage);
    clickOption(zhCN.note.addExistingPages);
    clickOption(zhCN.common.unpin);
    clickOption(zhCN.note.renamePage);
    clickOption(zhCN.note.moveThisPage);
    clickOption(zhCN.common.copyLink);
    clickOption(zhCN.noteShare.shareAction);
    clickOption(zhCN.note.moveToTrash);

    expect(events.create).toHaveBeenCalledWith(node);
    expect(events.attach).toHaveBeenCalledWith(node);
    expect(events.toggleTop).toHaveBeenCalledWith(node);
    expect(events.rename).toHaveBeenCalledWith(node);
    expect(events.move).toHaveBeenCalledWith(node);
    expect(events.copyLink).toHaveBeenCalledWith(node);
    expect(events.share).toHaveBeenCalledWith(node);
    expect(events.delete).toHaveBeenCalledWith(node);
    expect(host.querySelector('.action-menu-option--danger')?.textContent).toContain(zhCN.note.moveToTrash);

    const row = host.querySelector<HTMLElement>('.note-tree-row')!;
    expect(row.getAttribute('draggable')).toBe('true');
    expect(row.dataset.noteTreeNodeId).toBe('note-1');
    expect(row.dataset.noteTreeParentId).toBe('__light_note_root__');
    expect(row.dataset.noteTreePinned).toBe('1');
    expect(host.querySelector('.note-tree-pin')?.getAttribute('aria-label')).toBe(zhCN.common.pinned);
    row.dispatchEvent(new Event('dragstart', { bubbles: true }));
    row.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(events.dragStart).toHaveBeenCalledWith(node, expect.any(Event));
    expect(events.dragEnd).toHaveBeenCalledTimes(1);
  });

  it('分享使用外链箭头，导出使用文档下载图标', () => {
    expect(icon.share).toContain('M13.5 4h5.25');
    expect(icon.noteDetail.exportLine).toContain('M12 10v7');
    expect(icon.noteDetail.exportLine).not.toContain('M13.5 4h5.25');
  });

  it('拖拽期间把禁用状态传给 ActionMenu', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(NoteTreeRow, {
          node: {
            id: 'note-2',
            parentId: null,
            title: '拖拽目录',
            childCount: 0,
            hasChildren: false,
            isTop: false,
            sort: 20,
          },
          depth: 0,
          currentParentId: null,
          childrenByParent: {},
          expandedIds: new Set<string>(),
          loadingKeys: new Set<string>(),
          menuDisabled: true,
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    expect(host.querySelector('.action-menu-stub')?.getAttribute('data-disabled')).toBe('true');
    expect(host.querySelector<HTMLButtonElement>('.action-menu-option')?.disabled).toBe(true);
  });

  it('富文本与 Markdown 页面使用不同的目录图标', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const commonProps = {
      depth: 0,
      childrenByParent: {},
      expandedIds: new Set<string>(),
      loadingKeys: new Set<string>(),
    };
    const app = createApp({
      render: () =>
        h('div', [
          h(NoteTreeRow, {
            ...commonProps,
            node: {
              id: 'html-note',
              parentId: null,
              title: '富文本页面',
              type: 'html',
              childCount: 0,
              hasChildren: false,
              isTop: false,
              sort: 10,
            },
          }),
          h(NoteTreeRow, {
            ...commonProps,
            node: {
              id: 'markdown-note',
              parentId: null,
              title: 'Markdown 页面',
              type: 'markdown',
              childCount: 0,
              hasChildren: false,
              isTop: false,
              sort: 20,
            },
          }),
        ]),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    const icons = [...host.querySelectorAll<HTMLElement>('.note-tree-page-icon')];
    expect(icons).toHaveLength(2);
    expect(icons[0].dataset.src).toBe(icon.resource.noteHtml);
    expect(icons[1].dataset.src).toBe(icon.resource.noteMarkdown);
  });

  it('展开子页面时使用独立过渡容器，保留父行并渐进显示子树', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const expandedIds = ref(new Set<string>());
    const parent = {
      id: 'parent-note',
      parentId: null,
      title: '父页面',
      childCount: 1,
      hasChildren: true,
      isTop: false,
      sort: 10,
    };
    const child = {
      id: 'child-note',
      parentId: 'parent-note',
      title: '子页面',
      childCount: 0,
      hasChildren: false,
      isTop: false,
      sort: 10,
    };
    const app = createApp({
      render: () =>
        h(NoteTreeRow, {
          node: parent,
          depth: 0,
          childrenByParent: { 'parent-note': [child] },
          expandedIds: expandedIds.value,
          loadingKeys: new Set<string>(),
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    expect(host.querySelector('.note-tree-children-motion')).toBeNull();
    expect(host.querySelectorAll('.note-tree-row')).toHaveLength(1);

    expandedIds.value = new Set(['parent-note']);
    await nextTick();

    expect(host.querySelector('.note-tree-children-motion')).not.toBeNull();
    expect(host.querySelector('.note-tree-children')?.textContent).toContain('子页面');
    expect(host.querySelectorAll('.note-tree-row')).toHaveLength(2);
  });

  it('分别显示同级让位动画和中央移入状态', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const position = ref<'before' | 'inside'>('before');
    const app = createApp({
      render: () =>
        h(NoteTreeRow, {
          node: {
            id: 'target-note',
            parentId: 'parent-note',
            title: '目标目录',
            childCount: 0,
            hasChildren: false,
            isTop: false,
            sort: 20,
          },
          depth: 1,
          currentParentId: null,
          childrenByParent: {},
          expandedIds: new Set<string>(),
          loadingKeys: new Set<string>(),
          dropTargetKey: 'target-note',
          dropTargetPosition: position.value,
          dropTargetActive: true,
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    const row = host.querySelector<HTMLElement>('.note-tree-row')!;
    const treeNode = host.querySelector<HTMLElement>('.note-tree-node')!;
    expect(row.classList.contains('is-drop-before')).toBe(true);
    expect(row.classList.contains('is-drop-candidate')).toBe(false);
    expect(treeNode.classList.contains('is-drop-before')).toBe(true);
    expect(treeNode.dataset.noteTreeDropPosition).toBe('before');

    position.value = 'inside';
    await nextTick();
    expect(row.classList.contains('is-drop-before')).toBe(false);
    expect(row.classList.contains('is-drop-candidate')).toBe(true);
    expect(row.classList.contains('is-drop-target')).toBe(true);
    expect(treeNode.classList.contains('is-drop-before')).toBe(false);
    expect(treeNode.dataset.noteTreeDropPosition).toBeUndefined();
  });
});

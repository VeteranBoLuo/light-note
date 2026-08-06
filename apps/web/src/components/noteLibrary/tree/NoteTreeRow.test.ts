import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

vi.mock('@/components/base/BasicComponents/BDropdown.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'BDropdownStub',
      props: { menuOptions: { type: Array, default: () => [] } },
      setup(props: { menuOptions: Array<Record<string, unknown>> }, { slots }) {
        return () =>
          h('div', { class: 'dropdown-stub' }, [
            slots.default?.(),
            ...props.menuOptions.map((option, index) =>
              option.divider
                ? h('hr', { key: `divider-${index}` })
                : h(
                    'button',
                    {
                      key: String(option.key || option.label || index),
                      class: ['dropdown-option', option.danger ? 'dropdown-option--danger' : ''],
                      onClick: option.function as () => void,
                    },
                    String(option.label || ''),
                  ),
            ),
          ]);
      },
    }),
  };
});
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({
  default: { name: 'BTooltipStub', template: '<span><slot /></span>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i aria-hidden="true" />' },
}));

const { default: NoteTreeRow } = await import('./NoteTreeRow.vue');

describe('NoteTreeRow 显式页面操作', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('单击标题只选择目录，打开正文及行菜单动作均有独立入口', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const events = {
      select: vi.fn(),
      open: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      move: vi.fn(),
      copyLink: vi.fn(),
      delete: vi.fn(),
    };
    const node = {
      id: 'note-1',
      parentId: null,
      title: '产品设计',
      childCount: 0,
      hasChildren: false,
      isTop: false,
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
          onRename: events.rename,
          onMove: events.move,
          onCopyLink: events.copyLink,
          onDelete: events.delete,
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    const title = host.querySelector<HTMLButtonElement>('.note-tree-title')!;
    title.click();
    title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(events.select).toHaveBeenCalledWith('note-1');
    expect(events.open).not.toHaveBeenCalled();

    host.querySelector<HTMLButtonElement>('.note-tree-action[aria-label="打开正文"]')!.click();
    expect(events.open).toHaveBeenCalledWith('note-1');

    const options = [...host.querySelectorAll<HTMLButtonElement>('.dropdown-option')];
    const clickOption = (label: string) => {
      const option = options.find((item) => item.textContent?.includes(label));
      expect(option).toBeDefined();
      option!.click();
    };
    clickOption(zhCN.note.newChildPage);
    clickOption(zhCN.note.renamePage);
    clickOption(zhCN.note.movePage);
    clickOption(zhCN.common.copyLink);
    clickOption(zhCN.note.moveToTrash);

    expect(events.create).toHaveBeenCalledWith(node);
    expect(events.rename).toHaveBeenCalledWith(node);
    expect(events.move).toHaveBeenCalledWith(node);
    expect(events.copyLink).toHaveBeenCalledWith(node);
    expect(events.delete).toHaveBeenCalledWith(node);
    expect(host.querySelector('.dropdown-option--danger')?.textContent).toContain(zhCN.note.moveToTrash);
  });
});

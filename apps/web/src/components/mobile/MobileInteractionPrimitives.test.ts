import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, watch } from 'vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import MobileListRow from './MobileListRow.vue';
import MobileListSurface from './MobileListSurface.vue';
import MobilePageActionsDrawer, { type MobilePageActionItem } from './MobilePageActionsDrawer.vue';

vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    name: 'BDrawerStub',
    props: ['open', 'title'],
    emits: ['close', 'afterClose'],
    setup(
      props: { open: boolean; title: string },
      { emit, slots }: { emit: (event: 'afterClose') => void; slots: Record<string, () => unknown> },
    ) {
      watch(
        () => props.open,
        async (open, wasOpen) => {
          if (open || !wasOpen) return;
          await nextTick();
          emit('afterClose');
        },
      );
      return () =>
        props.open ? h('section', { class: 'drawer-stub', 'data-title': props.title }, slots.default?.()) : null;
    },
  },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub', 'aria-hidden': 'true' }) },
}));

let cleanup: (() => void) | undefined;

function mount(render: () => ReturnType<typeof h>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('mobile interaction primitives', () => {
  it('renders one semantic list surface and keeps selected rows explicit', async () => {
    const onClick = vi.fn();
    const host = mount(() =>
      h(
        MobileListSurface,
        { ariaLabel: '主题列表' },
        {
          default: () => [
            h(
              MobileListRow,
              { interactive: true, selected: true, onClick },
              { title: () => '工具', subtitle: () => '42 项资源' },
            ),
            h(MobileListRow, {}, { title: () => '资源' }),
          ],
        },
      ),
    );
    await nextTick();

    const surface = host.querySelector<HTMLElement>('.mobile-list-surface');
    const rows = host.querySelectorAll<HTMLElement>('.mobile-list-row');
    const listItems = host.querySelectorAll<HTMLElement>('[role="listitem"]');
    expect(surface?.getAttribute('role')).toBe('list');
    expect(surface?.getAttribute('aria-label')).toBe('主题列表');
    expect(rows).toHaveLength(2);
    expect(listItems).toHaveLength(2);
    expect(rows[0].tagName).toBe('BUTTON');
    expect(rows[0].getAttribute('role')).toBeNull();
    expect(rows[0].getAttribute('aria-current')).toBe('true');
    expect(rows[0].classList.contains('is-selected')).toBe(true);

    rows[0].click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('lets a complex row expose pointer-wide surface clicks without nesting its child controls', async () => {
    const onClick = vi.fn();
    const childClick = vi.fn();
    const host = mount(() =>
      h(
        MobileListRow,
        { surfaceClickable: true, onClick },
        {
          default: () => [
            h('span', { class: 'row-copy' }, '待办正文'),
            h(
              BButton,
              {
                class: 'row-child',
                onClick: (event: MouseEvent) => {
                  event.stopPropagation();
                  childClick();
                },
              },
              () => '系列',
            ),
          ],
        },
      ),
    );
    await nextTick();

    const row = host.querySelector<HTMLElement>('.mobile-list-row')!;
    expect(row.tagName).toBe('DIV');
    row.click();
    expect(onClick).toHaveBeenCalledOnce();

    host.querySelector<HTMLButtonElement>('.row-child')!.click();
    expect(childClick).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('uses the object title and emits only enabled action selections', async () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    const open = ref(true);
    const actions: MobilePageActionItem[] = [
      { key: 'edit', label: '编辑', description: '修改当前待办' },
      { key: 'selected', label: '普通', selected: true },
      { key: 'disabled', label: '不可用', disabled: true },
      { key: 'delete', label: '删除', danger: true, dividerBefore: true },
    ];
    const host = mount(() =>
      h(MobilePageActionsDrawer, {
        open: open.value,
        title: '更多操作',
        objectTitle: '笔记新增知识库',
        actions,
        'onUpdate:open': (value: boolean) => {
          open.value = value;
          onOpenChange(value);
        },
        onAction,
      }),
    );
    await nextTick();

    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('笔记新增知识库');
    const items = host.querySelectorAll<HTMLButtonElement>('.mobile-page-actions__item');
    expect(items).toHaveLength(4);
    expect(items[1].classList.contains('is-selected')).toBe(true);
    expect(items[3].classList.contains('is-danger')).toBe(true);
    expect(items[3].classList.contains('has-divider')).toBe(true);
    expect(host.textContent).toContain('修改当前待办');

    items[2].click();
    expect(onAction).not.toHaveBeenCalled();
    items[3].click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await vi.waitFor(() => {
      expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ key: 'delete', danger: true }));
    });
  });
});

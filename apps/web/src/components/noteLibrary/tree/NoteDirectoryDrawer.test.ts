import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
  historyCallbacks: [] as Array<() => void>,
  registerHistory: vi.fn(),
  releaseHistory: vi.fn(),
}));

vi.mock('@/http/request', () => ({ apiBasePost: mocks.apiBasePost }));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: async (close: () => void, next: () => unknown) => {
    close();
    return await next();
  },
  registerMobileOverlayHistory: mocks.registerHistory,
  releaseMobileOverlayHistory: mocks.releaseHistory,
  requestMobileOverlayHistoryClose: vi.fn(() => false),
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'BDrawerStub',
      props: { open: Boolean },
      emits: ['close'],
      setup(props, { slots }) {
        return () => (props.open ? h('section', { class: 'drawer-stub' }, slots.default?.()) : null);
      },
    }),
  };
});
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
              h(
                'button',
                {
                  key: String(option.label || index),
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
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ name: 'SvgIconStub', setup: () => () => h('span') }) };
});

import NoteDirectoryDrawer from './NoteDirectoryDrawer.vue';

async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('NoteDirectoryDrawer 返回层级', () => {
  let unmount: (() => void) | null = null;

  beforeEach(() => {
    mocks.historyCallbacks.length = 0;
    mocks.registerHistory.mockReset().mockImplementation((callback: () => void) => {
      mocks.historyCallbacks.push(callback);
      return { id: `drawer-${mocks.historyCallbacks.length}` };
    });
    mocks.releaseHistory.mockReset();
    mocks.apiBasePost
      .mockReset()
      .mockImplementation(async (url: string, body: { parentId?: string | null; noteId?: string | null }) => {
        if (url.endsWith('queryNoteBreadcrumb')) {
          const paths: Record<string, Array<{ id: string; title: string; depth: number }>> = {
            a: [{ id: 'a', title: 'A', depth: 0 }],
            b: [
              { id: 'a', title: 'A', depth: 0 },
              { id: 'b', title: 'B', depth: 1 },
            ],
          };
          return { status: 200, data: { items: paths[String(body.noteId || '')] || [] } };
        }
        const children: Record<string, Array<Record<string, unknown>>> = {
          root: [{ id: 'a', title: 'A', childCount: 1, hasChildren: true, depth: 0 }],
          a: [{ id: 'b', title: 'B', parentId: 'a', childCount: 1, hasChildren: true, depth: 1 }],
          b: [{ id: 'c', title: 'C', parentId: 'b', childCount: 0, hasChildren: false, depth: 2 }],
        };
        return { status: 200, data: { items: children[String(body.parentId || 'root')] || [] } };
      });
  });

  afterEach(() => {
    unmount?.();
    unmount = null;
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('Android 返回键先逐级返回目录，再关闭抽屉', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const open = ref(true);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteDirectoryDrawer, {
              open: open.value,
              'onUpdate:open': (value: boolean) => (open.value = value),
              currentParentId: null,
            });
        },
      }),
    );
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { note: {}, common: {} } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('auto-scrollbar', {});
    app.mount(host);
    unmount = () => app.unmount();
    await flushUi();

    expect(mocks.historyCallbacks).toHaveLength(1);
    click('.note-drawer-enter');
    await flushUi();
    click('.note-drawer-enter');
    await flushUi();

    expect(document.querySelector('.note-drawer-current')?.textContent).toContain('B');
    mocks.historyCallbacks[0]();
    await flushUi();
    expect(open.value).toBe(true);
    expect(document.querySelector('.note-drawer-current')?.textContent).toContain('A');

    mocks.historyCallbacks[1]();
    await flushUi();
    expect(open.value).toBe(true);
    expect(document.querySelector('.note-drawer-current')?.textContent).not.toContain('A');

    mocks.historyCallbacks[2]();
    await flushUi();
    expect(open.value).toBe(false);
  });

  it('点击面包屑切换到对应目录并保持抽屉打开', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const open = ref(true);
    const selected = vi.fn();
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteDirectoryDrawer, {
              open: open.value,
              'onUpdate:open': (value: boolean) => (open.value = value),
              currentParentId: 'a',
              onSelect: selected,
            });
        },
      }),
    );
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { note: {}, common: {} } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('auto-scrollbar', {});
    app.mount(host);
    unmount = () => app.unmount();
    await flushUi();

    click('.note-drawer-breadcrumb > button:first-of-type');
    await flushUi();

    expect(open.value).toBe(true);
    expect(selected).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledWith(null);
    expect(document.querySelector('.note-drawer-current')?.textContent).not.toContain('A');
  });

  it('浏览层级与已选目录不同时不再显示绿色勾选态', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(
      defineComponent({
        setup() {
          return () => h(NoteDirectoryDrawer, { open: true, currentParentId: 'a' });
        },
      }),
    );
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { note: {}, common: {} } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('auto-scrollbar', {});
    app.mount(host);
    unmount = () => app.unmount();
    await flushUi();

    expect(document.querySelector('.note-drawer-current')?.classList.contains('is-selected')).toBe(true);
    expect(document.querySelector('.note-drawer-current-check')).not.toBeNull();

    click('.note-drawer-enter');
    await flushUi();

    expect(document.querySelector('.note-drawer-current')?.classList.contains('is-selected')).toBe(false);
    expect(document.querySelector('.note-drawer-current-check')).toBeNull();
  });

  it('目录行主区域直接选择范围，进入下一层和更多按钮不会冒泡触发选择', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const open = ref(true);
    const selected = vi.fn();
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteDirectoryDrawer, {
              open: open.value,
              'onUpdate:open': (value: boolean) => (open.value = value),
              currentParentId: null,
              onSelect: selected,
            });
        },
      }),
    );
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { note: {}, common: {} } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('auto-scrollbar', {});
    app.mount(host);
    unmount = () => app.unmount();
    await flushUi();

    click('.note-drawer-enter');
    await flushUi();
    expect(selected).not.toHaveBeenCalled();
    expect(open.value).toBe(true);

    click('.note-drawer-more');
    await flushUi();
    expect(selected).not.toHaveBeenCalled();
    expect(open.value).toBe(true);

    click('.note-drawer-select');
    await flushUi();
    expect(selected).toHaveBeenCalledWith('b');
    expect(open.value).toBe(false);
  });

  it('移动端目录行菜单可将完整节点交给删除确认流程并先关闭抽屉', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const open = ref(true);
    const deleted = vi.fn();
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteDirectoryDrawer, {
              open: open.value,
              'onUpdate:open': (value: boolean) => (open.value = value),
              currentParentId: null,
              onDelete: deleted,
            });
        },
      }),
    );
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { note: {}, common: {} } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('auto-scrollbar', {});
    app.mount(host);
    unmount = () => app.unmount();
    await flushUi();

    click('.note-drawer-more');
    await flushUi();
    const deleteAction = document.querySelector<HTMLButtonElement>('.mobile-page-actions__item.is-danger');
    expect(deleteAction).not.toBeNull();
    deleteAction!.click();
    await flushUi();

    expect(open.value).toBe(false);
    expect(deleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', title: 'A', hasChildren: true, childCount: 1 }),
    );
  });

  it('可注入确定性目录数据用于离线交互验收且不会请求业务接口', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const toggledTop = vi.fn();
    const loadDirectoryLevel = vi.fn(async (parentId: string | null) => ({
      items: [{ id: 'local', parentId, title: '离线目录', childCount: 0, hasChildren: false, isTop: true, sort: 0 }],
      breadcrumb: parentId ? [{ id: parentId, title: '当前目录' }] : [],
    }));
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteDirectoryDrawer, {
              open: true,
              currentParentId: null,
              loadDirectoryLevel,
              onToggleTop: toggledTop,
            });
        },
      }),
    );
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { note: {}, common: { pin: '置顶', unpin: '取消置顶' } } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('auto-scrollbar', {});
    app.mount(host);
    unmount = () => app.unmount();
    await flushUi();

    expect(loadDirectoryLevel).toHaveBeenCalledWith(null);
    expect(mocks.apiBasePost).not.toHaveBeenCalled();
    expect(document.querySelector('.note-drawer-row-title')?.textContent).toContain('离线目录');
    expect(document.querySelector('.note-drawer-row-pin')).not.toBeNull();
    click('.note-drawer-more');
    await flushUi();
    const unpinAction = [...document.querySelectorAll<HTMLButtonElement>('.mobile-page-actions__item')].find((option) =>
      option.textContent?.includes('取消置顶'),
    );
    expect(unpinAction).toBeDefined();
    unpinAction!.click();
    await flushUi();
    expect(toggledTop).toHaveBeenCalledWith(expect.objectContaining({ id: 'local', isTop: true }));
  });

  it('目录能力关闭时不再把标签伪装成目录页签，也不会发送隐藏的目录请求', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteDirectoryDrawer, {
              open: true,
              currentParentId: null,
              directoryEnabled: false,
            });
        },
      }),
    );
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { note: {}, common: {} } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('auto-scrollbar', {});
    app.mount(host);
    unmount = () => app.unmount();
    await flushUi();

    expect(document.querySelector('.note-drawer-tags')).toBeNull();
    expect(document.querySelector('.note-drawer-empty')).not.toBeNull();
    expect(mocks.apiBasePost).not.toHaveBeenCalled();
  });
});

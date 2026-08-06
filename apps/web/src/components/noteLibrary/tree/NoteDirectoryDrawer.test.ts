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
      setup(_, { slots }) {
        return () => h('div', slots.default?.());
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
});

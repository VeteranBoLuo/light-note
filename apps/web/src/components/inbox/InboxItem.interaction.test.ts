import { createApp, h, nextTick, reactive } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import InboxItem from './InboxItem.vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } }) }));
vi.mock('@/components/mobile/MobileSwipeActions.vue', () => ({
  default: {
    inheritAttrs: false,
    setup:
      (_: unknown, { slots }: any) =>
      () =>
        slots.default?.(),
  },
}));
vi.mock('@/components/mobile/MobilePageActionsDrawer.vue', () => ({ default: { inheritAttrs: false, render: () => null } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { inheritAttrs: false, render: () => null } }));
let cleanup: () => void;
afterEach(() => cleanup?.());

function mount() {
  const state = reactive({ selected: false, inspected: false, selectionMode: false, disabled: false });
  const onOpen = vi.fn();
  const onSelect = vi.fn((selected: boolean) => {
    state.selected = selected;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(InboxItem, {
        ...state,
        selectable: state.selectionMode,
        item: {
          resourceType: 'note',
          resourceId: 'note-1',
          title: '资料一',
          summary: '摘要',
          detail: '',
          source: 'manual',
          collectedAt: '',
          resourceCreatedAt: '',
        },
        onOpen,
        onSelect,
      }),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { state, onOpen, onSelect, body: host.querySelector<HTMLElement>('.inbox-item__body')! };
}

it('普通点击请求详情，详情高亮由父级已展示条目驱动，不切换批量选择', async () => {
  const { state, body, onOpen, onSelect } = mount();
  body.click();
  expect(onOpen).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();
  expect(body.getAttribute('aria-pressed')).toBe('false');
  state.inspected = true;
  await nextTick();
  expect(body.getAttribute('aria-pressed')).toBe('true');
});

it('批量模式下点击和键盘只切换勾选，不打开详情', async () => {
  const { state, body, onOpen, onSelect } = mount();
  state.selectionMode = true;
  await nextTick();
  body.click();
  await nextTick();
  expect(body.getAttribute('aria-pressed')).toBe('true');
  body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await nextTick();
  expect(onSelect.mock.calls).toEqual([[true], [false]]);
  expect(onOpen).not.toHaveBeenCalled();
});

it('处理期间忽略点击和键盘操作', async () => {
  const { state, body, onOpen, onSelect } = mount();
  state.disabled = true;
  await nextTick();
  body.click();
  body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(body.tabIndex).toBe(-1);
  expect(onOpen).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

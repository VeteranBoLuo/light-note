import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { useRangeSelection, type RangeSelectionController } from '@/composables/useRangeSelection';
import PhoneListMg from './PhoneListMg.vue';

vi.mock('@/utils/common', () => ({ backRouterPage: vi.fn() }));
vi.mock('@/components/base/ResourcePageShell.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

it('搜索、替换列表、加载和错误状态向选择会话提供实际可见集合', async () => {
  const props = reactive({
    listData: [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ],
    loading: false,
    error: false,
  });
  const emitted = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(PhoneListMg, { ...props, showActions: false, 'onVisible-items-change': emitted }),
  });
  app.directive('click-log', {});
  app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: {} }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  expect(emitted.mock.lastCall?.[0].map((x: any) => x.id)).toEqual(['a', 'b']);
  const input = host.querySelector('input')!;
  input.value = 'alpha';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  expect(emitted.mock.lastCall?.[0].map((x: any) => x.id)).toEqual(['a']);
  props.listData = [{ id: 'c', name: 'Alpha 2' }];
  await nextTick();
  expect(emitted.mock.lastCall?.[0].map((x: any) => x.id)).toEqual(['c']);
  props.loading = true;
  await nextTick();
  expect(emitted.mock.lastCall?.[0]).toEqual([]);
  props.loading = false;
  props.error = true;
  await nextTick();
  expect(emitted.mock.lastCall?.[0]).toEqual([]);
});


it('手机管理行的主按钮可首尾连选，首点不触发普通单项选择', async () => {
  const selected = ref<string[]>(['outside']);
  const items = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
  let range!: RangeSelectionController;
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp({ setup() {
    range = useRangeSelection({ active: true, mobile: true, groups: [{ id: 'default', keys: items.map((item) => item.id) }],
      apply: (keys) => { selected.value = [...new Set([...selected.value, ...keys])]; } });
    return () => h(PhoneListMg, { listData: items, selectedKeys: selected.value, rangeSelection: range, showActions: false,
      'onItem-click': (item: any) => { selected.value.push(item.id); } });
  } });
  app.directive('click-log', {});
  app.use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: {} }));
  app.mount(host); cleanup = () => { app.unmount(); host.remove(); };
  range.toggle();
  const buttons = host.querySelectorAll<HTMLButtonElement>('button.mobile-list-row');
  buttons[0].click(); await nextTick();
  expect(selected.value).toEqual(['outside']);
  expect(host.querySelector('.range-selection-anchor')).not.toBeNull();
  buttons[2].click(); await nextTick();
  expect(selected.value).toEqual(['outside', 'a', 'b', 'c']);
  expect(range.selecting).toBe(false);
});

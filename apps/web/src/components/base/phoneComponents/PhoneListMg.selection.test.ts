import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
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

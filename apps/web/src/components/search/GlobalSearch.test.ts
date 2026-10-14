import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import GlobalSearch from './GlobalSearch.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'cloudSpace', path: '/cloudSpace', query: {} }),
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/utils/globalSearchNavigation', () => ({ navigateToSearchResult: vi.fn() }));
vi.mock('@/composables/useGlobalSearchSuggestions', () => ({
  useGlobalSearchSuggestions: () => ({
    items: ref([]),
    loading: ref(false),
    failed: ref(false),
    schedule: vi.fn(),
    run: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({ default: { template: '<span><slot /></span>' } }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
});

it('全局搜索在输入框和对话框按钮消费 Escape，输入法和长按不关闭，下层预览不接收事件', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GlobalSearch) });
  app.directive('click-log', {});
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: {}, missingWarn: false, fallbackWarn: false }));
  const background = vi.fn();
  document.addEventListener('keydown', background);
  cleanup = () => {
    app.unmount();
    host.remove();
    document.removeEventListener('keydown', background);
  };
  app.mount(host);
  const open = async () => {
    host.querySelector<HTMLButtonElement>('button')!.click();
    await nextTick();
  };
  const escape = (target: Element, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init }));
  await open();
  const input = document.querySelector('#global-search-input')!;
  escape(input, { isComposing: true });
  escape(input, { repeat: true });
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).not.toBeNull();
  escape(input);
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).toBeNull();
  expect(background).not.toHaveBeenCalled();
  await open();
  escape(document.querySelector('.global-search-dialog button')!);
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).toBeNull();
  expect(background).not.toHaveBeenCalled();
});

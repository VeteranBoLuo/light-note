import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import GlobalSearch from './GlobalSearch.vue';

const state = vi.hoisted(() => ({ navigate: vi.fn(), locate: vi.fn(), items: [] as any[] }));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'cloudSpace', path: '/cloudSpace', query: {} }),
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/utils/globalSearchNavigation', () => ({
  navigateToSearchResult: state.navigate,
  locateSearchResult: state.locate,
}));
vi.mock('@/composables/useGlobalSearchSuggestions', () => ({
  useGlobalSearchSuggestions: () => ({
    items: ref(state.items),
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
  cleanup = undefined;
  state.items = [];
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it.each(['open', 'locate'] as const)('桌面文件搜索的 %s 操作关闭搜索，并只分发对应导航', async (action) => {
  state.items = [{ id: 'file-42', type: 'file', title: '报告.pdf', description: '' }];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GlobalSearch) });
  app.directive('click-log', {});
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: {}, missingWarn: false, fallbackWarn: false }));
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  app.mount(host);
  host.querySelector<HTMLButtonElement>('button')!.click();
  await nextTick();
  const selector = action === 'open' ? '.global-search-result__open' : '.global-search-result__extra button';
  document.querySelector<HTMLButtonElement>(selector)!.click();
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).toBeNull();
  expect(state[action === 'open' ? 'navigate' : 'locate']).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    state.items[0],
  );
  expect(state[action === 'open' ? 'locate' : 'navigate']).not.toHaveBeenCalled();
});

it.each([
  { fileType: 'image/jpeg', fileSize: 356516, folderName: '图片素材' },
  { file_type: 'image/jpeg', file_size: 356516, folder_name: '图片素材' },
])('文件元数据兼容接口字段并保留类型、文件夹和独立大小：%o', async (raw) => {
  state.items = [
    { id: 'file-42', type: 'file', title: '图像文件', description: '位于 图片素材', extra: '图片 · 0.34 MB', raw },
  ];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GlobalSearch) });
  app.directive('click-log', {});
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { cloudSpace: { image: '图片' } } },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  app.mount(host);
  host.querySelector<HTMLButtonElement>('button')!.click();
  await nextTick();
  expect(document.querySelector('.global-search-result__description')!.textContent).toBe('图片 · 位于 图片素材');
  expect(document.querySelector('.global-search-result__extra')!.textContent?.trim()).toBe('0.34 MB');
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

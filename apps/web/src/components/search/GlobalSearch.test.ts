import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import GlobalSearch from './GlobalSearch.vue';

const state = vi.hoisted(() => ({ navigate: vi.fn(), locate: vi.fn(), items: [] as any[], route: null as any }));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => state.route || { name: 'cloudSpace', path: '/cloudSpace', query: {} },
}));
vi.mock('@/store/publicResourceScope', () => ({
  usePublicResourceScope: () => ({
    eligible: false,
    caps: { enabled: false },
    included: false,
    identity: 'fixture',
    ensure: vi.fn(),
  }),
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/utils/openBookmark', () => ({ openBookmarkUrl: vi.fn() }));
vi.mock('@/utils/globalSearchNavigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  navigateToSearchResult: state.navigate,
  locateSearchResult: state.locate,
}));
vi.mock('@/composables/useGlobalSearchSuggestions', () => ({
  useGlobalSearchSuggestions: () => ({
    items: ref(state.items),
    loading: ref(false),
    failed: ref(false),
    publicFailed: ref(false),
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
  state.route = null;
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

it('资源中心只同步全站范围到 URL 时保持快捷搜索打开，真正导航才关闭', async () => {
  state.route = reactive({
    name: 'searchCenter',
    path: '/search',
    query: { q: '原关键词', public: '0' },
    fullPath: '/search?q=原关键词&public=0',
  });
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
  const input = document.querySelector<HTMLInputElement>('#global-search-input')!;
  input.value = '快捷层关键词';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  state.route.query = { q: '原关键词', public: '1' };
  state.route.fullPath = '/search?q=原关键词&public=1';
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).not.toBeNull();
  expect(input.value).toBe('快捷层关键词');
  state.route.path = '/home';
  state.route.fullPath = '/home';
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).toBeNull();
});

it('从书签页快捷搜索进入公开资源时携带真实完整来源，关闭弹框后导航', async () => {
  state.route = reactive({ name: 'home', path: '/home', query: { tag: 'x' }, fullPath: '/home?tag=x#cards' });
  state.items = [{ id: 'pub', type: 'bookmark', title: '公开书签', description: '', origin: 'public' }];
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
  document.querySelector<HTMLButtonElement>('.global-search-result__open')!.click();
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).toBeNull();
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith(expect.anything(), state.items[0], {
    publicReturnPath: '/home?tag=x#cards',
  });
});

it.each([{ metaKey: true }, { ctrlKey: true }])(
  '从详情返回后，自动聚焦的搜索框继续消费搜索命令：%o',
  async (modifier) => {
    state.route = reactive({ name: 'searchCenter', path: '/search', query: {}, fullPath: '/search' });
    const host = document.createElement('div');
    const searchInput = document.createElement('input');
    searchInput.id = 'search-center-input';
    const editor = document.createElement('textarea');
    document.body.append(host, searchInput, editor);
    const app = createApp({ render: () => h(GlobalSearch) });
    app.directive('click-log', {});
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: {}, missingWarn: false, fallbackWarn: false }));
    cleanup = () => {
      app.unmount();
      host.remove();
      searchInput.remove();
      editor.remove();
    };
    app.mount(host);
    const command = (target: Element) => {
      const event = new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        bubbles: true,
        cancelable: true,
        ...modifier,
      });
      target.dispatchEvent(event);
      return event;
    };
    expect(command(document.body).defaultPrevented).toBe(true);
    await nextTick();
    expect(document.querySelector('.global-search-dialog')).not.toBeNull();
    state.route.name = 'publicResourceDetail';
    state.route.path = '/public-resources/example';
    state.route.fullPath = '/public-resources/example?from=/search';
    await nextTick();
    expect(document.querySelector('.global-search-dialog')).toBeNull();
    state.route.name = 'searchCenter';
    state.route.path = '/search';
    state.route.fullPath = '/search';
    await nextTick();
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);
    expect(command(searchInput).defaultPrevented).toBe(true);
    await nextTick();
    const quickInput = document.querySelector<HTMLInputElement>('#global-search-input')!;
    expect(document.activeElement).toBe(quickInput);
    expect(command(quickInput).defaultPrevented).toBe(true);
    quickInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await nextTick();
    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    searchInput.dispatchEvent(slash);
    expect(slash.defaultPrevented).toBe(false);
    expect(command(editor).defaultPrevented).toBe(false);
    await nextTick();
    expect(document.querySelector('.global-search-dialog')).toBeNull();
  },
);

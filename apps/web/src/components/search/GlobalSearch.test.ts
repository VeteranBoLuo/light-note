import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import GlobalSearch from './GlobalSearch.vue';
import { featureShortcutZh } from '@/i18n/locales/featureShortcut';

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  locate: vi.fn(),
  runFeature: vi.fn(),
  items: [] as any[],
  route: null as any,
  user: { role: 'user' },
  guest: false,
  featured: { items: [] as any[], loadedAt: 0, loading: false, failed: false },
}));

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
vi.mock('@/store', () => ({
  bookmarkStore: () => ({ isDesktop: true, isMobile: false }),
  useUserStore: () => state.user,
}));
vi.mock('@/utils/savePreference', () => ({ isGuestUser: () => state.guest }));
vi.mock('@/composables/useFeatureShortcuts', () => ({
  runFeatureShortcut: state.runFeature,
  useFeaturedFeatures: () => ({ state: state.featured, ensure: vi.fn(), save: vi.fn() }),
}));
vi.mock('@/components/search/FeaturedFeaturesManager.vue', () => ({ default: { template: '<div class="manager" />' } }));
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({ default: { template: '<span><slot /></span>' } }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  state.items = [];
  state.route = null;
  state.user = { role: 'user' };
  state.guest = false;
  state.featured.items = [];
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

function mountSearch() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GlobalSearch) });
  app.directive('click-log', {});
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { featureShortcut: featureShortcutZh } },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  app.mount(host);
  return host;
}

async function openAndType(host: HTMLElement, value: string) {
  host.querySelector<HTMLButtonElement>('button')!.click();
  await nextTick();
  const input = document.querySelector<HTMLInputElement>('#global-search-input')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  return input;
}

function key(target: Element, name: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

it('输入命中功能时功能组排在资料前，上下键先经过功能，Enter 关闭搜索并执行', async () => {
  state.items = [{ id: 'n1', type: 'note', title: '周报导出流程', description: '' }];
  const host = mountSearch();
  const input = await openAndType(host, '导出');
  const rows = [...document.querySelectorAll('.gs-feature-row')];
  expect(rows.map((row) => row.querySelector('.gs-feature-row__title')!.textContent)).toEqual([
    '导出笔记',
    '备份全部资料',
    '添加到设备日历',
  ]);
  expect(rows[2].querySelector('.gs-feature-row__alias')!.textContent).toContain('导出日程');
  expect(document.querySelector('.global-search-features + .global-search-group')).not.toBeNull();
  key(input, 'ArrowDown');
  key(input, 'ArrowDown');
  await nextTick();
  expect(rows[1].classList.contains('is-active')).toBe(true);
  key(input, 'Enter');
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).toBeNull();
  expect(state.runFeature).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: 'data-backup' }),
    expect.anything(),
    '【桌面快捷搜索】',
  );
});

it('只命中功能没有资料时，资料区退为一行提示', async () => {
  const host = mountSearch();
  await openAndType(host, '收藏夹');
  expect(document.querySelectorAll('.gs-feature-row')).toHaveLength(1);
  expect(document.querySelector('.global-search__empty-inline')!.textContent).toContain('没有找到包含「收藏夹」的资料');
  expect(document.querySelector('.global-search__empty')).toBeNull();
});

it('未输入时顶部展示最近上线，最近资料每类保留 2 条；只有 Root 看到管理入口', async () => {
  state.featured.items = [{ featureId: 'manor', description: '', publishDate: '2026-01-02' }];
  state.items = [
    { id: 'b1', type: 'bookmark', title: '书签一', description: '' },
    { id: 'b2', type: 'bookmark', title: '书签二', description: '' },
    { id: 'b3', type: 'bookmark', title: '书签三', description: '' },
  ];
  let host = mountSearch();
  host.querySelector<HTMLButtonElement>('button')!.click();
  await nextTick();
  const featured = document.querySelector('.global-search-featured')!;
  expect(featured.querySelector('.gs-feature-row__title')!.textContent).toBe('知识庄园');
  expect(featured.querySelector('.gs-feature-row__badge')!.textContent).toBe('新');
  expect(featured.querySelector('.global-search-featured__manage')).toBeNull();
  expect(document.querySelectorAll('.global-search-result')).toHaveLength(2);
  cleanup?.();

  state.user = { role: 'root' };
  state.featured.items = [];
  host = mountSearch();
  host.querySelector<HTMLButtonElement>('button')!.click();
  await nextTick();
  expect(document.querySelector('.global-search-featured__empty')).not.toBeNull();
  document.querySelector<HTMLButtonElement>('.global-search-featured__manage')!.click();
  await nextTick();
  expect(document.querySelector('.global-search-dialog')).toBeNull();
  expect(host.querySelector('.manager')).not.toBeNull();
});

it('有关键词时按每组最匹配的一条排组，组内顺序不变', async () => {
  state.items = [
    { id: 'f1', type: 'file', title: '发票-2026-10.pdf', description: '' },
    { id: 't1', type: 'todo', title: '整理十月发票', description: '' },
    { id: 'f2', type: 'file', title: '发票报销汇总.xlsx', description: '' },
    { id: 'b1', type: 'bookmark', title: '发票查验平台', description: '' },
  ];
  const host = mountSearch();
  await openAndType(host, '发票');
  expect([...document.querySelectorAll('.global-search-result__title')].map((node) => node.textContent)).toEqual([
    '发票-2026-10.pdf',
    '发票报销汇总.xlsx',
    '整理十月发票',
    '发票查验平台',
  ]);
});

it('键盘移动时滚动跟随：移出可视区的项刚好露出，回到第一项时回到顶部', async () => {
  state.items = Array.from({ length: 6 }, (_, index) => ({
    id: `n${index}`,
    type: 'note',
    title: `周会纪要${index}`,
    description: '',
  }));
  const host = mountSearch();
  // 「周会」不命中任何功能，导航只包含资料行。
  const input = await openAndType(host, '周会');
  expect(document.querySelector('.gs-feature-row')).toBeNull();
  const body = document.querySelector<HTMLElement>('.global-search-dialog__body')!;
  const scrollTo = vi.fn();
  body.scrollTo = scrollTo as any;
  body.getBoundingClientRect = () => ({ top: 0, bottom: 100 }) as DOMRect;
  document.querySelectorAll<HTMLElement>('.global-search-result').forEach((row, index) => {
    row.getBoundingClientRect = () => ({ top: index * 60, bottom: index * 60 + 58 }) as DOMRect;
  });
  key(input, 'ArrowDown');
  key(input, 'ArrowDown');
  key(input, 'ArrowDown');
  await nextTick();
  await nextTick();
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 78, behavior: 'auto' });
  scrollTo.mockClear();
  key(input, 'ArrowUp');
  key(input, 'ArrowUp');
  await nextTick();
  await nextTick();
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 });
});

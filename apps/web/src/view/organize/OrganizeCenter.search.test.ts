import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import zh from '@/i18n/locales/zh-CN';
import { bookmarkStore, useUserStore } from '@/store';
import OrganizeCenter from './OrganizeCenter.vue';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/api/organizeApi', async (original) => ({
  ...(await original<object>()),
  getOrganizeSummary: vi.fn().mockResolvedValue({ status: 200, data: null }),
  getOrganizeIssueList: mocks.search,
}));
vi.mock('@/api/organizeSuggestionApi', async (original) => ({
  ...(await original<object>()),
  listRuns: vi.fn().mockResolvedValue({ status: 200, data: [] }),
}));
let app: App;
let host: HTMLElement;
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await nextTick();
}
async function mount() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useUserStore().setUserInfo({ id: 'search-test', role: 'user' });
  bookmarkStore().screenWidth = 1280;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/organize', component: OrganizeCenter },
      { path: '/:pathMatch(.*)*', component: { render: () => h('p', '资料详情') } },
      { path: '/other', component: { render: () => h('p', '其他页面') } },
    ],
  });
  await router.push('/organize?issue=untagged');
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(RouterView) });
  app
    .use(pinia)
    .use(router)
    .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.component('svg-icon', { render: () => h('span') });
  app.directive('auto-scrollbar', {});
  app.mount(host);
  await settle();
  mocks.search.mockClear();
  return router;
}
function input(value: string) {
  const element = host.querySelector<HTMLInputElement>('.organize-filter-bar input')!;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  return element;
}
beforeEach(() => {
  vi.useFakeTimers();
  mocks.search.mockResolvedValue({ status: 200, data: { items: [], hasMore: false, nextCursor: null } });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('连续输入只在停止 300ms 后查询一次；回车立即执行且不重复查询', async () => {
  await mount();
  input('项');
  await vi.advanceTimersByTimeAsync(200);
  const element = input('项目');
  await vi.advanceTimersByTimeAsync(299);
  expect(mocks.search).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.search).toHaveBeenCalledTimes(1);
  expect(mocks.search.mock.calls[0]).toEqual(['untagged', expect.objectContaining({ keyword: '项目' })]);
  input('新项目');
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle();
  expect(mocks.search).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(400);
  expect(mocks.search).toHaveBeenCalledTimes(2);
});
it('中文组词不查询，结束后搜索；清空输入重新查询全部结果', async () => {
  await mount();
  const element = host.querySelector<HTMLInputElement>('.organize-filter-bar input')!;
  element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  input('xiang');
  await vi.advanceTimersByTimeAsync(500);
  expect(mocks.search).not.toHaveBeenCalled();
  input('项目');
  element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  expect(mocks.search).toHaveBeenCalledTimes(1);
  input('');
  await vi.advanceTimersByTimeAsync(300);
  expect(mocks.search.mock.calls.at(-1)).toEqual(['untagged', expect.objectContaining({ keyword: '' })]);
});
it('离开页面取消尚未发出的搜索，避免返回现场被后台计时器清空', async () => {
  const router = await mount();
  input('项目');
  await router.push('/other');
  await vi.advanceTimersByTimeAsync(500);
  expect(mocks.search).not.toHaveBeenCalled();
});

it('切换资源类型立即查询，并取消关键词的待执行防抖', async () => {
  await mount();
  input('项目');
  host.querySelector<HTMLElement>('[role="combobox"]')!.click();
  await nextTick();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent?.trim() === '文件',
  );
  expect(option).toBeTruthy();
  option!.click();
  await settle();
  expect(mocks.search).toHaveBeenCalledTimes(1);
  expect(mocks.search.mock.calls[0]).toEqual([
    'untagged',
    expect.objectContaining({ keyword: '项目', resourceType: 'file' }),
  ]);
  await vi.advanceTimersByTimeAsync(400);
  expect(mocks.search).toHaveBeenCalledTimes(1);
});

it.each([
  ['bookmark', '书签', '/manage/editBookmark/42'],
  ['file', '文件', '/cloudSpace'],
  ['note', '笔记', '/noteLibrary/42'],
])('实际列表打开 %s 后返回保留输入与类型，并查询最新结果', async (resourceType, label, path) => {
  mocks.search.mockResolvedValue({
    status: 200,
    data: {
      items: [{ resourceType, resourceId: '42', title: '项目资料', summary: '测试资料' }],
      hasMore: false,
      nextCursor: null,
    },
  });
  const router = await mount();
  input('项目');
  host.querySelector<HTMLElement>('[role="combobox"]')!.click();
  await nextTick();
  [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    .find((item) => item.textContent?.trim() === label)!
    .click();
  await settle();
  const open = [...host.querySelectorAll<HTMLButtonElement>('.organize-resource-row button')].find(
    (item) => item.textContent?.trim() === '打开',
  );
  expect(open).toBeTruthy();
  const navigated = new Promise<void>((resolve) => {
    const stop = router.afterEach(() => {
      stop();
      resolve();
    });
  });
  open!.click();
  await navigated;
  await settle();
  expect(router.currentRoute.value.path).toBe(path);
  expect(router.currentRoute.value.query.from).toBe('/organize?issue=untagged');
  // 模拟详情期间资料被加标签或删除，返回不得复活旧列表项。
  mocks.search.mockResolvedValue({ status: 200, data: { items: [], hasMore: false, nextCursor: null } });
  await router.push('/organize?issue=untagged');
  await settle();
  await vi.advanceTimersByTimeAsync(64);
  expect(host.querySelector<HTMLInputElement>('.organize-filter-bar input')?.value).toBe('项目');
  expect(host.querySelector('[role="combobox"]')?.textContent?.trim()).toBe(label);
  expect(mocks.search.mock.calls.at(-1)).toEqual([
    'untagged',
    expect.objectContaining({ keyword: '项目', resourceType }),
  ]);
  expect(host.querySelector('.organize-resource-row')).toBeNull();
});

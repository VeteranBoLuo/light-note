import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import zhCN from '@/i18n/locales/zh-CN';
import { useResourceSelectionStore } from '@/store/resourceSelection';
import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
const mocks = vi.hoisted(() => ({ post: vi.fn(), user: null as any, refresh: vi.fn(), message: vi.fn() }));
vi.mock('@/store', () => ({
  useUserStore: () => mocks.user,
  bookmarkStore: () => ({ isMobile: false }),
  cloudSpaceStore: () => ({ queryFieldList: mocks.refresh }),
}));
vi.mock('@/http/request.ts', () => ({ apiBasePost: mocks.post }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { error: mocks.message, warning: mocks.message, info: mocks.message, success: mocks.message },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
const { default: Page } = await import('./SearchBatchTags.vue');
const items = ['1', '2', '3'].map((id) => ({ id, type: 'file' as const, title: `文件${id}` }));
function workspace() {
  return {
    status: 200,
    data: {
      items,
      selectionSummary: { editableCount: 3, typeCounts: { file: 3 } },
      tagRelationCounts: { a: 2, b: 3 },
      allTags: [
        { id: 'a', name: '设计' },
        { id: 'b', name: '资料' },
        { id: 'c', name: '工作' },
      ],
      selectedResourceTags: [
        { id: 'a', name: '设计' },
        { id: 'b', name: '资料' },
      ],
      resourceTagsMap: { 'file:1': [{ id: 'a', name: '设计' }] },
    },
  };
}
let cleanup = () => {};
afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = reactive({ id: 'user', role: 'user', adminContext: null });
  mocks.post.mockResolvedValue(workspace());
});
async function settle() {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
async function mount() {
  const pinia = createPinia();
  const store = useResourceSelectionStore(pinia);
  store.start('files', buildNoteDetailRequestScope(mocks.user));
  store.setItems(items);
  const token = store.handoffTags(store.beginOperation()!, '/cloudSpace?folderId=1');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search/batch-tags', component: Page },
      { path: '/cloudSpace', component: { render: () => h('div', '云空间') } },
    ],
  });
  await router.push({ path: '/search/batch-tags', query: { selectionSession: token } });
  const app = createApp({ render: () => h(RouterView) });
  app
    .use(pinia)
    .use(router)
    .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('auto-scrollbar', {});
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await settle();
  const tag = (name: string) =>
    [...host.querySelectorAll<HTMLElement>('.tag-option')].find((node) =>
      node.textContent?.replace(/\s+/g, '').includes(name),
    )!;
  const button = (name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
      node.textContent?.replace(/\s+/g, '').includes(name),
    )!;
  return { host, router, store, tag, button };
}
describe('批量标签选择和反馈', () => {
  it('准确预览新增数量，全部已有标签禁选，搜索不会清空已选标签', async () => {
    const x = await mount();
    expect(x.tag('资料').getAttribute('aria-disabled')).toBe('true');
    x.tag('设计').click();
    await nextTick();
    expect(x.host.querySelector('.preview-result')?.textContent).toContain('预计新增 1 处标签');
    const input = x.host.querySelector<HTMLInputElement>('.tag-search input')!;
    input.value = '工作';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    x.host.querySelector<HTMLElement>('.selection-toolbar [role=checkbox]')!.click();
    await nextTick();
    expect(x.host.querySelector('.preview-result')?.textContent).toContain('预计新增 4 处标签');
    expect(x.host.querySelectorAll('.selected-tags .resource-tag-chip')).toHaveLength(2);
    x.button('清空选择').click();
    await nextTick();
    expect(x.button('确认批量添加').disabled).toBe(true);
  });
  it('切换移除会清空添加草稿，只提供已有标签并按实际覆盖数提交', async () => {
    const x = await mount();
    x.tag('设计').click();
    await nextTick();
    [...x.host.querySelectorAll<HTMLElement>('[role=tab]')].find((node) => node.textContent === '移除标签')!.click();
    await settle();
    expect(x.host.querySelectorAll('.selected-tags .resource-tag-chip')).toHaveLength(0);
    expect(x.tag('工作')).toBeUndefined();
    x.tag('设计').click();
    await nextTick();
    expect(x.host.querySelector('.preview-result')?.textContent).toContain('预计移除 2 处标签');
    mocks.post.mockResolvedValueOnce({ status: 200, data: { affectedRelationCount: 2, skippedRelationCount: 1 } });
    x.button('确认批量移除').click();
    await settle();
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/api/search/batchUpdateResourceTags',
      {
        action: 'remove',
        tagIds: ['a'],
        selection: { mode: 'explicit', items: items.map(({ type, id }) => ({ type, id })) },
      },
      { silent: true },
    );
    expect(x.router.currentRoute.value.path).toBe('/cloudSpace');
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(x.store.items).toHaveLength(3);
  });
  it('加载失败提供页内重试，提交失败保留草稿并允许再次提交', async () => {
    mocks.post.mockResolvedValueOnce({ status: 500 });
    const x = await mount();
    expect(x.host.querySelector('[role=alert]')?.textContent).toContain('无法加载资源与标签');
    x.button('重新加载').click();
    await settle();
    x.tag('设计').click();
    await nextTick();
    mocks.post.mockResolvedValueOnce({ status: 500 });
    x.button('确认批量添加').click();
    await settle();
    expect(x.host.querySelector('.submit-error')?.textContent).toContain('提交失败');
    expect(x.host.querySelectorAll('.selected-tags .resource-tag-chip')).toHaveLength(1);
    expect(x.button('确认批量添加').disabled).toBe(false);
    expect(mocks.message).not.toHaveBeenCalled();
  });
});

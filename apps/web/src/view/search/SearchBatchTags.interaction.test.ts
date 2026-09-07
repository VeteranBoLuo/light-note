import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, watch } from 'vue';
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
await import('@/components/resourceActions/ResourceBatchTagsDrawer.vue');
const { default: Host } = await import('@/components/resourceActions/ResourceBatchTagsHost.vue');
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
  store.handoffTags(store.beginOperation()!, '/cloudSpace?folderId=1');
  store.handoff!.drawer = true;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cloudSpace', component: { render: () => h('div', '云空间') } }],
  });
  await router.push('/cloudSpace?folderId=1');
  const app = createApp({
    setup() {
      watch(() => store.tagUpdate, mocks.refresh);
      return () => [h(RouterView), h(Host)];
    },
  });
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
  const surface = document.body;
  const tag = (name: string) =>
    [...surface.querySelectorAll<HTMLElement>('.tag-option')].find((node) =>
      node.textContent?.replace(/\s+/g, '').includes(name),
    )!;
  const button = (name: string) =>
    [...surface.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
      node.textContent?.replace(/\s+/g, '').includes(name),
    )!;
  return { host: surface, router, store, tag, button };
}
describe('批量标签选择和反馈', () => {
  it('默认折叠资源清单，取消抽屉保留来源、批量模式与选择', async () => {
    const x = await mount();
    expect(x.host.querySelector('.item-list')).toBeNull();
    x.button('查看资源清单').click();
    await nextTick();
    expect(x.host.querySelectorAll('.item-row')).toHaveLength(3);
    x.tag('设计').click();
    await nextTick();
    x.button('取消').click();
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(x.router.currentRoute.value.fullPath).toBe('/cloudSpace?folderId=1');
    expect(x.store.items).toHaveLength(3);
    expect(x.store.module).toBe('files');
    expect(x.store.busy).toBe(false);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('提交期间锁定关闭和重复提交，身份切换后的迟到回执不刷新新会话', async () => {
    const x = await mount();
    x.tag('设计').click();
    await nextTick();
    let resolve!: (value: any) => void;
    mocks.post.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    x.button('确认添加').click();
    await nextTick();
    expect(x.button('取消').disabled).toBe(true);
    expect(x.host.querySelector<HTMLButtonElement>('.b-drawer-close')?.disabled).toBe(true);
    x.host
      .querySelector('.b-drawer-panel')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(x.store.handoff).not.toBeNull();
    await x.router.push('/cloudSpace?folderId=2');
    expect(x.router.currentRoute.value.fullPath).toBe('/cloudSpace?folderId=1');
    x.store.end();
    x.store.start('files', 'another-identity');
    resolve({ status: 200, data: { affectedRelationCount: 1 } });
    await settle();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.message).not.toHaveBeenCalled();
  });
  it('较多已选标签可展开，搜索无结果仍保留全部待提交标签', async () => {
    const data = workspace();
    data.data.allTags = Array.from({ length: 10 }, (_, i) => ({ id: `tag-${i}`, name: `标签 ${i}` }));
    mocks.post.mockResolvedValueOnce(data);
    const x = await mount();
    x.host.querySelector<HTMLElement>('.selection-toolbar [role=checkbox]')!.click();
    await nextTick();
    expect(x.host.querySelectorAll('.selected-tags .resource-tag-chip')).toHaveLength(6);
    x.button('另4个标签').click();
    await nextTick();
    expect(x.host.querySelectorAll('.selected-tags .resource-tag-chip')).toHaveLength(10);
    const input = x.host.querySelector<HTMLInputElement>('.tag-search input')!;
    input.value = '不存在';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(x.host.querySelectorAll('.tag-option')).toHaveLength(0);
    expect(x.host.querySelectorAll('.selected-tags .resource-tag-chip')).toHaveLength(10);
    expect(x.button('确认添加').disabled).toBe(false);
  });
  it('准确预览新增数量，全部已有标签禁选，搜索不会清空已选标签', async () => {
    const x = await mount();
    expect(x.tag('资料').getAttribute('aria-disabled')).toBe('true');
    x.tag('设计').click();
    await nextTick();
    expect(x.host.querySelector('.preview-result')?.textContent).toContain('将新增 1 条标签关联');
    const input = x.host.querySelector<HTMLInputElement>('.tag-search input')!;
    input.value = '工作';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    x.host.querySelector<HTMLElement>('.selection-toolbar [role=checkbox]')!.click();
    await nextTick();
    expect(x.host.querySelector('.preview-result')?.textContent).toContain('将新增 4 条标签关联');
    expect(x.host.querySelectorAll('.selected-tags .resource-tag-chip')).toHaveLength(2);
    x.button('清空选择').click();
    await nextTick();
    expect(x.button('确认添加').disabled).toBe(true);
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
    expect(x.host.querySelector('.preview-result')?.textContent).toContain('将移除 2 条标签关联');
    mocks.post.mockResolvedValueOnce({ status: 200, data: { affectedRelationCount: 2, skippedRelationCount: 1 } });
    x.button('确认移除').click();
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
    expect(x.router.currentRoute.value.fullPath).toBe('/cloudSpace?folderId=1');
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(x.store.busy).toBe(false);
    expect(x.store.handoff).toBe(null);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(x.store.items).toHaveLength(3);
  });
  it('加载失败提供页内重试，提交失败保留草稿并允许再次提交', async () => {
    mocks.post.mockResolvedValueOnce({ status: 500 });
    const x = await mount();
    expect(x.host.querySelector('[role=alert]')?.textContent).toContain('无法加载资源与标签');
    expect(x.button('查看资源清单').disabled).toBe(true);
    x.button('重新加载').click();
    await settle();
    x.tag('设计').click();
    await nextTick();
    mocks.post.mockResolvedValueOnce({ status: 500 });
    x.button('确认添加').click();
    await settle();
    expect(x.host.querySelector('.submit-error')?.textContent).toContain('提交失败');
    expect(x.host.querySelectorAll('.selected-tags .resource-tag-chip')).toHaveLength(1);
    expect(x.button('确认添加').disabled).toBe(false);
    expect(mocks.message).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import { createApp, defineComponent, h, reactive, ref, nextTick, type App } from 'vue';
import { useResourceSelection, useResourceSelectionRuntime } from './useResourceSelection';
import { useResourceSelectionStore } from '@/store/resourceSelection';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';

const mocks = vi.hoisted(() => ({ user: null as any, preview: vi.fn(), info: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/search', () => ({ previewSearchBatchSelection: mocks.preview }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { info: mocks.info, warning: mocks.info, error: mocks.info },
}));
const apps: Array<{ app: App; host: HTMLElement }> = [];
afterEach(() =>
  apps.splice(0).forEach(({ app, host }) => {
    app.unmount();
    host.remove();
  }),
);
function mount(component: any, plugins: any[] = []) {
  const app = createApp(component);
  plugins.forEach((plugin) => app.use(plugin));
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  apps.push({ app, host });
  return host;
}
const allCheckbox = (host: HTMLElement) => host.querySelector<HTMLElement>('[role=checkbox]')!;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = reactive({ id: 'user', role: 'user', adminContext: null });
});
const item = (id: string) => ({ id, title: id, type: 'html' });
const deferred = () => {
  let resolve!: (data: any) => void;
  let reject!: (error: any) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const success = (ids: string[], unavailable: string[] = []) => ({
  status: 200,
  data: {
    resolvedItems: ids.map((id) => ({ id, type: 'note', title: id, noteType: 'html' })),
    unavailableItems: unavailable.map((id) => ({ id, type: 'note' })),
  },
});
async function harness() {
  const visible = ref([item('a'), item('b')]);
  const loading = ref(false);
  let selection!: ReturnType<typeof useResourceSelection>;
  const page = defineComponent({
    setup() {
      selection = useResourceSelection('notes', visible, 'note', loading);
      return () =>
        h(BTable, {
          data: visible.value,
          columns: [{ key: 'title', title: 'Name' }],
          selectable: true,
          preserveSelection: true,
          selectedRows: selection.ids.value,
          onSelectionChange: (ids) => {
            selection.ids.value = ids;
          },
        });
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/noteLibrary', '/cloudSpace', '/search/batch-tags'].map((path) => ({ path, component: page })),
  });
  await router.push('/noteLibrary?parent=A');
  await router.isReady();
  const pinia = createPinia();
  const wrapper = mount(
    defineComponent({
      setup() {
        useResourceSelectionRuntime();
        return () => h(RouterView);
      },
    }),
    [pinia, router, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: {} })],
  );
  selection.mode.value = true;
  await nextTick();
  return { wrapper, router, visible, loading, selection, store: useResourceSelectionStore(pinia) };
}

describe('跨目录选择：组件、路由、请求闭环', () => {
  it('目录快捷操作的显式范围不依赖后台列表是否加载，且不替换原选择', async () => {
    const x = await harness();
    x.selection.toggle(item('a'));
    x.loading.value = true;
    mocks.preview.mockResolvedValueOnce(success(['folder-file']));
    const op = await x.selection.prepare([{ id: 'folder-file', type: 'note', title: '目录文件' }]);
    expect(op?.items.map((item) => item.id)).toEqual(['folder-file']);
    expect(x.store.items.map((item) => item.id)).toEqual(['a']);
    x.selection.finish(op);
  });

  it('真实 BTable 切目录累积 2+3，返回恢复勾选；取消 B 全选不影响 A', async () => {
    const x = await harness();
    allCheckbox(x.wrapper).click();
    await nextTick();
    await x.router.push('/noteLibrary?parent=B');
    x.visible.value = ['c', 'd', 'e'].map(item);
    await nextTick();
    allCheckbox(x.wrapper).click();
    await nextTick();
    expect(x.selection.ids.value).toEqual(['a', 'b', 'c', 'd', 'e']);
    x.visible.value = [item('a'), item('b')];
    await x.router.push('/noteLibrary?parent=A');
    await nextTick();
    expect(
      [...x.wrapper.querySelectorAll('[role=checkbox]')].every((c) => c.getAttribute('aria-checked') === 'true'),
    ).toBe(true);
    x.visible.value = ['c', 'd', 'e'].map(item);
    await nextTick();
    allCheckbox(x.wrapper).click();
    await nextTick();
    expect(x.selection.ids.value).toEqual(['a', 'b']);
  });
  it('加载新目录时旧列表不能全选；空结果、追加和刷新失败不裁剪', async () => {
    const x = await harness();
    x.selection.toggle(item('a'));
    x.loading.value = true;
    x.selection.selectVisible(true);
    expect(x.selection.ids.value).toEqual(['a']);
    expect(x.selection.visibleSelected.value).toBe(0);
    x.visible.value = [];
    x.loading.value = false;
    await nextTick();
    expect(x.selection.ids.value).toEqual(['a']);
    x.visible.value = [item('a'), item('c')];
    await nextTick();
    expect(x.selection.someVisible.value).toBe(true);
  });
  it('准备快照期间锁选择，失败原样保留；不可用项移除并停止动作', async () => {
    const x = await harness();
    x.selection.selectVisible(true);
    const pending = deferred();
    mocks.preview.mockReturnValueOnce(pending.promise);
    const preparing = x.selection.prepare();
    x.selection.clear();
    x.selection.toggle(item('b'));
    expect(x.selection.ids.value).toEqual(['a', 'b']);
    pending.reject(new Error('offline'));
    expect(await preparing).toBe(null);
    expect(x.store.busy).toBe(false);
    mocks.preview.mockResolvedValueOnce(success(['b'], ['a']));
    expect(await x.selection.prepare()).toBe(null);
    expect(x.selection.ids.value).toEqual(['b']);
  });
  it('动作材料独立于列表，删除后核对失败只留下重试状态', async () => {
    const x = await harness();
    x.selection.selectVisible(true);
    mocks.preview.mockResolvedValueOnce(success(['a', 'b']));
    const op = (await x.selection.prepare())!;
    x.visible.value = [item('c')];
    await nextTick();
    expect(op.items.map((i) => i.id)).toEqual(['a', 'b']);
    mocks.preview.mockRejectedValueOnce(new Error('offline'));
    await x.selection.reconcile(op);
    expect(x.store.pendingReconcile?.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(x.store.busy).toBe(false);
    expect(await x.selection.prepare()).toBe(null);
    expect(x.store.reviewOpen).toBe(true);
  });
  it('取消导航保留；离开后迟到预览不能覆盖新会话', async () => {
    const x = await harness();
    x.selection.selectVisible(true);
    const remove = x.router.beforeEach((to) => (to.path === '/cloudSpace' ? false : undefined));
    await x.router.push('/cloudSpace');
    expect(x.selection.ids.value).toHaveLength(2);
    remove();
    const late = deferred();
    mocks.preview.mockReturnValueOnce(late.promise);
    const preparing = x.selection.prepare();
    await x.router.push('/cloudSpace');
    await x.router.push('/noteLibrary');
    x.selection.mode.value = true;
    x.selection.toggle(item('b'));
    late.resolve(success([], ['a', 'b']));
    expect(await preparing).toBe(null);
    expect(x.selection.ids.value).toEqual(['b']);
  });
  it.each(['id', 'subjectUserId', 'mode'])('代管范围 %s 变化立即销毁会话', async (field) => {
    const x = await harness();
    mocks.user.adminContext = { id: 'context-a', subjectUserId: 'target-a', mode: 'readonly' };
    x.selection.mode.value = true;
    x.selection.selectVisible(true);
    mocks.user.adminContext[field] = 'changed';
    expect(x.store.module).toBe(null);
    expect(x.store.items).toEqual([]);
  });
  it('标签往返保留选择和批量模式；单项子操作不替换已有选择', async () => {
    const x = await harness();
    x.selection.selectVisible(true);
    mocks.preview.mockResolvedValueOnce(success(['single']));
    await x.selection.openTags('add', [{ id: 'single', type: 'note', title: 'single' }]);
    expect(x.router.currentRoute.value.fullPath).toBe('/noteLibrary?parent=A');
    expect(x.store.handoff?.drawer).toBe(true);
    expect(x.store.handoff?.operation.items.map((i) => i.id)).toEqual(['single']);
    x.store.closeTags(x.store.handoff!.token);
    expect(x.selection.ids.value).toEqual(['a', 'b']);
    expect(x.store.busy).toBe(false);
  });
  it('单项标签准备的旧失败不能结束新建会话；动作上限不会截断材料', async () => {
    const x = await harness();
    x.selection.mode.value = false;
    const pending = deferred();
    mocks.preview.mockReturnValueOnce(pending.promise);
    const opening = x.selection.openTags('add', [{ id: 'single', type: 'note', title: 'single' }]);
    x.selection.mode.value = false;
    x.selection.mode.value = true;
    x.selection.selectVisible(true);
    pending.reject(new Error('offline'));
    await opening;
    expect(x.selection.mode.value).toBe(true);
    expect(x.selection.ids.value).toEqual(['a', 'b']);
    mocks.preview.mockClear();
    expect(await x.selection.prepare(undefined, 1)).toBe(null);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(x.selection.ids.value).toEqual(['a', 'b']);
  });
});

describe('查询全选预览会话', () => {
  it('预览失败保留原选择，成功只保存固定查询副本', async () => {
    const x = await harness();
    x.selection.selectVisible(true);
    mocks.preview.mockRejectedValueOnce(new Error('offline'));
    const query: any = { mode: 'allMatching', query: { q: 'old', types: ['note'] } };
    expect(await x.selection.replaceWithQuery(query)).toBe(false);
    expect(x.selection.ids.value).toEqual(['a', 'b']);
    const pending = deferred();
    mocks.preview.mockReturnValueOnce(pending.promise);
    const replacing = x.selection.replaceWithQuery(query);
    query.query.q = 'edited';
    pending.resolve({ status: 200, data: { mode: 'allMatching', total: 12 } });
    expect(await replacing).toBe(true);
    expect(x.store.query?.query).toMatchObject({ q: 'old' });
    expect(x.store.items).toEqual([]);
    const op = x.store.beginOperation()!;
    expect(op.selection).toMatchObject({ mode: 'allMatching', query: { q: 'old' } });
    x.store.finish(op);
  });
  it('匹配条件变化或退出后的迟到预览不能替换显式选择', async () => {
    const x = await harness();
    x.selection.selectVisible(true);
    let matches = true;
    const pending = deferred();
    mocks.preview.mockReturnValueOnce(pending.promise);
    const replacing = x.selection.replaceWithQuery({ mode: 'allMatching', query: {} }, null, () => matches);
    matches = false;
    pending.resolve({ status: 200, data: { mode: 'allMatching', total: 99 } });
    expect(await replacing).toBe(false);
    expect(x.selection.ids.value).toEqual(['a', 'b']);
    const late = deferred();
    mocks.preview.mockReturnValueOnce(late.promise);
    const next = x.selection.replaceWithQuery({ mode: 'allMatching', query: {} });
    x.selection.mode.value = false;
    x.selection.mode.value = true;
    x.selection.toggle(item('b'));
    late.resolve({ status: 200, data: { mode: 'allMatching', total: 99 } });
    expect(await next).toBe(false);
    expect(x.selection.ids.value).toEqual(['b']);
  });
});

describe('BTable 兼容', () => {
  it('默认全选仍替换数组；保留模式按当前列表做并集/差集', async () => {
    const props = reactive({ data: [{ id: 'b' }], selectable: true, selectedRows: ['a'], preserveSelection: false });
    const emitted: string[][] = [];
    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(BTable, { ...props, onSelectionChange: (ids) => emitted.push(ids) });
        },
      }),
    );
    allCheckbox(wrapper).click();
    expect(emitted.at(-1)).toEqual(['b']);
    props.preserveSelection = true;
    props.selectedRows = ['a'];
    await nextTick();
    props.selectedRows = ['a', 'b'];
    await nextTick();
    allCheckbox(wrapper).click();
    expect(emitted.at(-1)).toEqual(['a']);
    props.selectedRows = ['a'];
    await nextTick();
    allCheckbox(wrapper).click();
    expect(emitted.at(-1)).toEqual(['a', 'b']);
  });
});

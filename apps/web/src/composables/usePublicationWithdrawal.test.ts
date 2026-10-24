import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, reactive } from 'vue';
import type { PublicationOwnState } from '@lightnote/shared/public-resources';
const mocks = vi.hoisted(() => ({
  scope: {} as any,
  send: vi.fn(),
  resolve: vi.fn(),
  lookup: vi.fn(),
  batch: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/api/publicResources', () => ({
  sendPublicResourceBatch: (...args: any[]) => mocks.batch(...args),
  resolvePublications: (ids: string[]) => mocks.resolve(ids),
  publicOperation: (path: string, body: any) =>
    Object.assign(() => mocks.send(path, body), { resolve: () => mocks.lookup(path, body) }),
}));
import { usePublicationWithdrawal } from './usePublicationWithdrawal';
let app: ReturnType<typeof createApp>;
const item = (id: string, version = 2, status: PublicationOwnState['status'] = 'published'): PublicationOwnState => ({
  publicId: id,
  kind: 'note',
  sourceId: 'source-' + id,
  title: '笔记' + id,
  version,
  status,
  oldVersionPublic: false,
  publishedRevision: status === 'published' ? 1 : null,
  pendingRevision: status === 'pending_review' ? 1 : null,
  latestRevision: 1,
});
function setup() {
  let state!: ReturnType<typeof usePublicationWithdrawal>;
  app = createApp({
    setup() {
      state = usePublicationWithdrawal(mocks.complete);
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  return state;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = reactive({ identity: 'one', eligible: true });
  mocks.send.mockImplementation(async (path, body) => ({
    publicId: path.split('/')[1],
    version: body.expectedVersion + 1,
  }));
  mocks.resolve.mockImplementation(async (ids: string[]) => ({ items: ids.map((id) => item(id)), unavailableIds: [] }));
  mocks.batch.mockImplementation(async (entries) => ({
    items: await Promise.all(
      entries.map(async (entry: any) => {
        try {
          const result = await mocks.send(entry.path, entry.body);
          return { requestId: entry.requestId, state: 'success', result };
        } catch (error: any) {
          return {
            requestId: entry.requestId,
            state: error.status >= 400 && error.status < 500 ? 'failed' : 'unknown',
            code: error.code,
          };
        }
      }),
    ),
  }));
  mocks.lookup.mockResolvedValue({ found: false });
  mocks.complete.mockResolvedValue(undefined);
});
afterEach(() => app?.unmount());
describe('批量撤回确认范围', () => {
  it('一次确认和处理100项，不截断为20项', async () => {
    const state = setup();
    state.targets.value = Array.from({ length: 100 }, (_, i) => item(String(i)));
    const intent = await state.prepare();
    expect(intent?.count).toBe(100);
    await intent!.run();
    expect(mocks.send).toHaveBeenCalledTimes(100);
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    expect(state.targets.value).toEqual([]);
  });
  it('预检发现状态变化先更新范围并停止，不能静默撤回剩余项', async () => {
    const state = setup();
    state.targets.value = [item('a'), item('b')];
    mocks.resolve.mockResolvedValueOnce({ items: [item('a', 4), item('b', 3, 'removed')], unavailableIds: [] });
    expect(await state.prepare()).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(state.error.value).toBe('PUBLIC_RESOURCE_BATCH_SELECTION_CHANGED');
    expect(state.targets.value.map((i) => i.publicId)).toEqual(['a']);
    expect(state.targets.value.find((i) => i.publicId === 'a')?.version).toBe(4);
  });
  it('取消危险确认不发请求，旧确认回调不能再次使用', async () => {
    const state = setup();
    state.targets.value = [item('a')];
    const intent = await state.prepare();
    expect(state.locked.value).toBe(true);
    intent!.cancel();
    await intent!.run();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(state.targets.value.length).toBe(1);
    expect(state.locked.value).toBe(false);
  });
  it('部分失败只保留未完成项，刷新后按新版本重新确认', async () => {
    const state = setup();
    state.targets.value = [item('a'), item('b'), item('c')];
    mocks.send
      .mockResolvedValueOnce({ publicId: 'a', version: 3 })
      .mockRejectedValueOnce({ status: 409, code: 'PUBLIC_RESOURCE_VERSION_CONFLICT' })
      .mockResolvedValueOnce({ publicId: 'c', version: 3 });
    const intent = await state.prepare();
    await intent!.run();
    expect(state.targets.value.map((i) => i.publicId)).toEqual(['b']);
    expect(state.needsRefresh.value).toBe(true);
    mocks.resolve.mockResolvedValue({ items: [item('b', 5, 'pending_review')], unavailableIds: [] });
    await state.refresh();
    expect(state.needsRefresh.value).toBe(false);
    const next = await state.prepare();
    await next!.run();
    expect(mocks.send.mock.calls.map((c) => c[0])).toEqual([
      'own/a/withdraw',
      'own/b/withdraw',
      'own/c/withdraw',
      'own/b/withdraw',
    ]);
    expect(mocks.send.mock.calls[3][1].expectedVersion).toBe(5);
  });
  it('未确认结果阻止新批量，查到成功回执后才移出选择', async () => {
    const state = setup();
    state.targets.value = [item('a')];
    mocks.send.mockRejectedValueOnce({ status: 0, code: 'ECONNABORTED' });
    const intent = await state.prepare();
    await intent!.run();
    expect(state.unknown.value).toHaveLength(1);
    expect(await state.prepare()).toBeNull();
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    mocks.lookup.mockResolvedValue({ found: true, result: { publicId: 'a', version: 3 } });
    await state.reconcile();
    expect(state.targets.value.length).toBe(0);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('切号后既有确认失效', async () => {
    const state = setup();
    state.targets.value = [item('a')];
    const intent = await state.prepare();
    mocks.scope.identity = 'two';
    await intent!.run();
    expect(state.targets.value.length).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

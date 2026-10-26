import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, reactive } from 'vue';
const mocks = vi.hoisted(() => ({
  scope: {} as any,
  prepare: vi.fn(),
  send: vi.fn(),
  lookup: vi.fn(),
  resolve: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/api/publicResources', () => ({
  preparePublications: (...args: any[]) => mocks.prepare(...args),
  sendPublicResourceBatch: (...args: any[]) => mocks.send(...args),
  resolvePublications: (...args: any[]) => mocks.resolve(...args),
  publicOperation: (_path: string, _body: any, requestId: string) =>
    Object.assign(vi.fn(), { resolve: () => mocks.lookup(requestId) }),
}));
import { usePublicationSubmission } from './usePublicationSubmission';
let app: ReturnType<typeof createApp>;
const source = (id: string) => ({ kind: 'note' as const, sourceId: id, title: id });
function setup() {
  let state!: ReturnType<typeof usePublicationSubmission>;
  app = createApp({
    setup() {
      state = usePublicationSubmission(mocks.complete);
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  return state;
}
const prepared = (items: any[]) => ({
  items: items.map((item) => ({
    ...item,
    title: '最新' + item.sourceId,
    fingerprint: 'fp-' + item.sourceId,
    expectedVersion: 7,
    code: '',
  })),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = reactive({ identity: 'one', eligible: true, caps: { submissionsEnabled: true } });
  mocks.prepare.mockImplementation(async (items) => prepared(items));
  mocks.send.mockImplementation(async (items) => ({
    items: items.map((item: any) => ({
      requestId: item.requestId,
      state: 'success',
      result: { publicId: item.body.sourceId, version: 8 },
    })),
  }));
  mocks.resolve.mockResolvedValue({ items: [] });
  mocks.complete.mockResolvedValue(undefined);
  mocks.lookup.mockResolvedValue({ found: false });
});
afterEach(() => app?.unmount());
it('确认前仅冻结所选元信息，不读取正文或发送投稿', () => {
  const state = setup(),
    original = source('one');
  state.start([original]);
  original.title = 'changed';
  expect(state.entries.value[0].title).toBe('one');
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it('确认100项只用一次材料准备和一次批量提交，并使用每项最新指纹与版本', async () => {
  const state = setup();
  state.start(Array.from({ length: 100 }, (_, i) => source(String(i))));
  await state.prepare();
  await Promise.all([state.submit(), state.submit()]);
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0]).toHaveLength(100);
  expect(mocks.send.mock.calls[0][0][99].body).toEqual({
    kind: 'note',
    sourceId: '99',
    fingerprint: 'fp-99',
    expectedVersion: 7,
    confirmed: true,
  });
  expect(state.locked.value).toBe(false);
});
it('校验中切号，迟到材料不能发起旧身份提交', async () => {
  let finish!: (value: any) => void;
  mocks.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const state = setup();
  state.start([source('one')]);
  const pending = state.prepare();
  mocks.scope.identity = 'two';
  finish(prepared([source('one')]));
  await pending;
  expect(mocks.send).not.toHaveBeenCalled();
  expect(state.entries.value).toEqual([]);
});
it('部分材料失败保留原因，重新确认只处理失败项', async () => {
  mocks.prepare.mockImplementationOnce(async (items) => {
    const value = prepared(items);
    value.items[1].code = 'PUBLIC_RESOURCE_TEXT_ONLY';
    return value;
  });
  const state = setup();
  state.start([source('one'), source('two')]);
  await state.prepare();
  await state.submit();
  expect(mocks.send.mock.calls[0][0]).toHaveLength(1);
  expect(state.failed.value[0].code).toBe('PUBLIC_RESOURCE_TEXT_ONLY');
  await state.retryFailed();
  expect(state.entries.value.map((item) => item.sourceId)).toEqual(['two']);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  await state.prepare();
  await state.submit();
  expect(mocks.send).toHaveBeenCalledTimes(2);
});
it('材料准备失败不发写入；能力关闭也不提交', async () => {
  mocks.prepare.mockRejectedValueOnce({ code: 'PUBLIC_RESOURCE_UNAVAILABLE' });
  const state = setup();
  state.start([source('one')]);
  await state.prepare();
  await state.submit();
  expect(state.failed.value).toHaveLength(1);
  expect(mocks.send).not.toHaveBeenCalled();
  state.start([source('one')]);
  mocks.scope.caps.submissionsEnabled = false;
  await state.submit();
  expect(mocks.send).not.toHaveBeenCalled();
});
it('结果不明阻止覆盖收据，只读核对成功后才允许新操作', async () => {
  mocks.send.mockRejectedValueOnce({ status: 0 });
  const state = setup();
  state.start([source('one')]);
  await state.prepare();
  await state.submit();
  expect(state.unknown.value).toHaveLength(1);
  expect(state.start([source('two')])).toBeUndefined();
  mocks.lookup.mockResolvedValueOnce({ found: true, result: { publicId: 'one', version: 8 } });
  await state.reconcile();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(state.unknown.value).toHaveLength(0);
  expect(state.start([source('two')])).toBe(true);
});
it('超过100项、空选择和重复选择不能提交', () => {
  const state = setup();
  expect(state.start([])).toBeUndefined();
  expect(state.start(Array.from({ length: 101 }, (_, i) => source(String(i))))).toBeUndefined();
  expect(state.start([source('one'), source('one')])).toBeUndefined();
});

it('材料在准备后冻结，确认提交不重新获取新稿；已经预览的内容变化要求重新预览', async () => {
  const state = setup();
  state.start([source('one')]);
  await state.prepare();
  mocks.prepare.mockImplementation(async (items) => ({
    items: items.map((item: any) => ({ ...item, fingerprint: 'new-fingerprint', expectedVersion: 8, code: '' })),
  }));
  await state.submit();
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0][0].body.fingerprint).toBe('fp-one');
  state.start([source('one')], new Map([['note:one', 'fp-one']]));
  expect(await state.prepare()).toBe(false);
  expect(state.failed.value[0].code).toBe('PUBLIC_RESOURCE_MATERIAL_CHANGED');
  await state.submit();
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, reactive } from 'vue';
const mocks = vi.hoisted(() => ({ scope: {} as any, send: vi.fn(), lookup: vi.fn(), factory: vi.fn() }));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/api/publicResources', () => ({
  sendPublicResourceBatch: (...args: any[]) => mocks.send(...args),
  publicOperation: (...args: any[]) => mocks.factory(...args),
}));
import { usePublicResourceBatch, type PublicBatchEntry } from './usePublicResourceBatch';
let app: ReturnType<typeof createApp>;
function setup() {
  let batch!: ReturnType<typeof usePublicResourceBatch>;
  app = createApp({
    setup() {
      batch = usePublicResourceBatch();
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  return batch;
}
const entries = (count = 3): PublicBatchEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    key: String(i),
    kind: 'note',
    title: '笔记' + i,
    path: 'submit',
    body: { sourceId: String(i), fingerprint: 'confirmed', confirmed: true },
  }));
const success = (input: any[]) => ({
  items: input.map((entry) => ({
    requestId: entry.requestId,
    state: 'success',
    result: { publicId: entry.body.sourceId, version: 1 },
  })),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = reactive({ identity: 'one', eligible: true });
  mocks.send.mockImplementation(async (input) => success(input));
  mocks.lookup.mockResolvedValue({ found: false });
  mocks.factory.mockImplementation((_path, _body, requestId) =>
    Object.assign(vi.fn(), { resolve: () => mocks.lookup(requestId) }),
  );
});
afterEach(() => app?.unmount());
describe('公开资源批量请求', () => {
  it('100项只发一个请求，保留全部独立请求ID和材料', async () => {
    const batch = setup();
    await batch.start(entries(100));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const input = mocks.send.mock.calls[0][0];
    expect(input).toHaveLength(100);
    expect(new Set(input.map((item: any) => item.requestId)).size).toBe(100);
    expect(input[99].body.sourceId).toBe('99');
    expect(batch.rows.value.every((row) => row.state === 'success')).toBe(true);
  });
  it('逐项呈现成功、复用、冲突和未知；缺失结果不能当成功', async () => {
    mocks.send.mockImplementation(async (input) => ({
      items: [
        { requestId: input[0].requestId, state: 'success', result: { publicId: 'a', version: 1 } },
        { requestId: input[1].requestId, state: 'reused', result: { publicId: 'b', version: 1, reused: true } },
        { requestId: input[2].requestId, state: 'failed', code: 'PUBLIC_RESOURCE_VERSION_CONFLICT' },
      ],
    }));
    const batch = setup();
    await batch.start(entries(4));
    expect(batch.rows.value.map((row) => row.state)).toEqual(['success', 'reused', 'failed', 'unknown']);
  });
  it('超时仅查回执，显式重试只发送查无回执项并保留原ID', async () => {
    mocks.send.mockRejectedValueOnce({ status: 0 });
    const batch = setup();
    await batch.start(entries(2));
    await batch.retryUnconfirmed();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    mocks.lookup
      .mockResolvedValueOnce({ found: true, result: { publicId: 'done', version: 1 } })
      .mockResolvedValueOnce({ found: false });
    await batch.reconcile();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(batch.rows.value.map((row) => row.state)).toEqual(['success', 'unknown']);
    await batch.retryUnconfirmed();
    expect(mocks.send.mock.calls[1][0]).toHaveLength(1);
    expect(mocks.send.mock.calls[1][0][0].requestId).toBe(mocks.send.mock.calls[0][0][1].requestId);
    expect(batch.rows.value.every((row) => row.state === 'success')).toBe(true);
  });
  it('整批HTTP失败可能已经部分提交，不能把全部资源直接当作失败', async () => {
    mocks.send.mockRejectedValueOnce({ status: 403, code: 'PUBLIC_RESOURCE_ACCOUNT_UNAVAILABLE' });
    const batch = setup();
    await batch.start(entries());
    expect(batch.rows.value.every((row) => row.state === 'unknown')).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('切号或卸载会清空收据草稿并忽略迟到响应', async () => {
    let finish!: (value: any) => void;
    mocks.send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const batch = setup();
    const pending = batch.start(entries());
    const input = mocks.send.mock.calls[0][0];
    mocks.scope.identity = 'two';
    finish(success(input));
    await pending;
    expect(batch.rows.value).toEqual([]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('拒绝重复键和超过100项，禁止静默截断', async () => {
    const batch = setup();
    await expect(batch.start(entries(101))).rejects.toThrow('PUBLIC_RESOURCE_INVALID_BATCH');
    const duplicate = entries(1);
    await expect(batch.start([...duplicate, ...duplicate])).rejects.toThrow('PUBLIC_RESOURCE_INVALID_BATCH');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

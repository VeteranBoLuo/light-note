import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/http/request', () => ({ apiBaseGet: mocks.get, apiBasePost: mocks.post }));
import { fetchCombinedSearch, publicOperation, resolvePublications, sendPublicResourceBatch } from './publicResources';
beforeEach(() => vi.clearAllMocks());
describe('公开资源操作回执', () => {
  it('100个明确 ID 一次轻量解析，不读取正文或遗漏', async () => {
    mocks.post.mockImplementation(async (_path, input) => ({
      status: 200,
      data: { items: input.ids.map((publicId: string) => ({ publicId })), unavailableIds: [] },
    }));
    const ids = Array.from({ length: 100 }, (_, i) => String(i));
    const result = await resolvePublications(ids);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls.every(([, input]) => input.ids.length === 100)).toBe(true);
    expect(result.items.map((i) => i.publicId)).toEqual(ids);
  });
  it('超时但已提交时读取回执，不重新创建副本', async () => {
    mocks.post.mockRejectedValue(new Error('timeout'));
    mocks.get.mockResolvedValue({ status: 200, data: { found: true, result: { id: 'saved-copy' } } });
    const operation = publicOperation('publication/save', { expectedVersion: 2 });
    expect(await operation()).toEqual({ id: 'saved-copy' });
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('显式重试先查回执，复用相同 requestId 和材料', async () => {
    mocks.post.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ status: 200, data: { id: 'copy' } });
    mocks.get.mockResolvedValue({ status: 200, data: { found: false } });
    const operation = publicOperation('publication/save', { expectedVersion: 2 });
    await expect(operation()).rejects.toThrow();
    expect(await operation()).toEqual({ id: 'copy' });
    expect(mocks.post.mock.calls[0][1]).toEqual(mocks.post.mock.calls[1][1]);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  it('未知结果可以只核对回执，不再次发送写请求', async () => {
    mocks.post.mockRejectedValueOnce(new Error('timeout'));
    mocks.get
      .mockResolvedValueOnce({ status: 200, data: { found: false } })
      .mockResolvedValueOnce({ status: 200, data: { found: true, result: { publicId: 'done' } } });
    const operation = publicOperation('submit', { fingerprint: 'confirmed' });
    await expect(operation()).rejects.toMatchObject({ status: 0 });
    expect(await operation.resolve()).toEqual({ found: true, result: { publicId: 'done' } });
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('混排接口只发送已登记字段，旧个人分页选项不外泄', async () => {
    mocks.post.mockResolvedValue({ status: 200, data: { items: [] } });
    await fetchCombinedSearch('关键词', {
      paginationMode: 'ordered',
      separateTagMatches: true,
      page: 3,
      todoPriority: [1],
      type: 'all',
    });
    expect(mocks.post.mock.calls[0][1]).toEqual({ keyword: '关键词', todoPriorities: [1], type: 'all' });
  });
});

it('批量写入保留逐项请求ID；审核走Root独立接口，拒绝混合动作', async () => {
  mocks.post.mockResolvedValue({ status: 200, data: { items: [] } });
  await sendPublicResourceBatch([
    {
      requestId: 'item-1',
      path: 'submit',
      body: { kind: 'note', sourceId: 'n', fingerprint: 'f', expectedVersion: 0, confirmed: true },
    },
  ]);
  expect(mocks.post.mock.calls[0][0]).toBe('/api/public-resources/batch');
  expect(mocks.post.mock.calls[0][1]).toMatchObject({
    action: 'submit',
    items: [{ requestId: 'item-1', sourceId: 'n', fingerprint: 'f', confirmed: true }],
  });
  await sendPublicResourceBatch([
    { requestId: 'item-2', path: 'moderation/p/decide', body: { expectedVersion: 2, action: 'approve', reason: '' } },
  ]);
  expect(mocks.post.mock.calls[1][0]).toBe('/api/public-resources/moderation/batch');
  expect(mocks.post.mock.calls[1][1]).toMatchObject({
    action: 'approve',
    items: [{ requestId: 'item-2', publicId: 'p', expectedVersion: 2 }],
  });
  await expect(
    sendPublicResourceBatch([
      { requestId: 'a', path: 'submit', body: {} },
      { requestId: 'b', path: 'own/p/withdraw', body: {} },
    ]),
  ).rejects.toThrow('PUBLIC_RESOURCE_INVALID_BATCH');
  expect(mocks.post).toHaveBeenCalledTimes(2);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ prepareManagedCloudUpload: vi.fn(), confirmManagedCloudUpload: vi.fn(), abortManagedCloudUpload: vi.fn() }));
vi.mock('./managedCloudUploadService.js', () => mocks);
const { processManagedUploadBatch } = await import('./managedCloudUploadBatchService.js');
beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); });
const request = (items) => ({ user: { id: 'owner', role: 'user' }, body: { items } });
describe('managed upload batch', () => {
  it.each([[], Array(4).fill({ operation: 'prepareManagedUpload', payload: {} }), [{ operation: 'constructor', payload: {} }], [{ operation: 'confirmManagedUpload', payload: [] }]])('整批验证上限和操作白名单', async (items) => {
    expect((await processManagedUploadBatch(request(items))).status).toBe(400);
    Object.values(mocks).forEach((mock) => expect(mock).not.toHaveBeenCalled());
  });
  it('逐项映射结果且认证信息不能被载荷覆盖，失败不影响其他文件', async () => {
    mocks.prepareManagedCloudUpload.mockResolvedValue({ objectKey: 'one' });
    mocks.confirmManagedCloudUpload.mockRejectedValue(new Error('SQL internal secret'));
    mocks.abortManagedCloudUpload.mockResolvedValue({ alreadyConfirmed: true, fileId: 'two' });
    const req = request([
      { operation: 'prepareManagedUpload', payload: { userId: 'attacker', userRole: 'root', fileName: 'a.txt' } },
      { operation: 'confirmManagedUpload', payload: { objectKey: 'two', request: 'forged' } },
      { operation: 'abortManagedUpload', payload: { objectKey: 'two' } },
    ]);
    const result = await processManagedUploadBatch(req);
    expect(result.data.map((item) => item.status)).toEqual([200, 400, 200]);
    expect(result.data[2].data.fileId).toBe('two');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(mocks.prepareManagedCloudUpload).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', userRole: 'user', request: req }));
    expect(mocks.confirmManagedCloudUpload).toHaveBeenCalledWith(expect.objectContaining({ request: req }));
  });
});

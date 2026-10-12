import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), snapshot: vi.fn(), read: vi.fn(), review: vi.fn() }));
vi.mock('../util/extraction/service.js', () => ({
  createExtraction: mocks.create,
  recordSnapshot: mocks.snapshot,
  readExtraction: mocks.read,
  reviewExtractionRecord: mocks.review,
}));
import { create, read, review, exportData } from './extractionHandle.js';
const request = (extra = {}) => ({
  user: { id: 'u', role: 'user' },
  params: { id: 'table', recordId: 'r' },
  body: {},
  ...extra,
});
const response = () => ({
  headersSent: false,
  status: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
});
beforeEach(() => vi.clearAllMocks());
describe('提取工作台 HTTP 权限与范围', () => {
  it.each(['visitor', 'admin', 'deleted'])('拒绝 %s 创建，拒绝管理员代管核对', async (role) => {
    const res = response();
    await create(request({ user: { id: 'u', role } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.create).not.toHaveBeenCalled();
    const managed = response();
    await review(request({ adminContext: { mode: 'maintain' }, resourceUser: { id: 'other', role: 'user' } }), managed);
    expect(managed.status).toHaveBeenCalledWith(403);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('身份由认证上下文决定，不能在 body 伪造 owner', async () => {
    mocks.create.mockResolvedValue({ id: 'new' });
    await create(request({ body: { userId: 'other' } }), response());
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u' }));
    mocks.read.mockRejectedValue(Object.assign(new Error('not found'), { code: 'EXTRACTION_NOT_FOUND', status: 404 }));
    const res = response();
    await read(request(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it('未明确范围不能导出；全部导出不接收客户端页号或隐藏筛选', async () => {
    let res = response();
    await exportData(request({ body: { format: 'csv' } }), res);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    mocks.snapshot.mockResolvedValue({ table: { title: '表', dataVersion: 1 }, records: [], sources: [] });
    res = response();
    await exportData(request({ body: { scope: 'all', format: 'csv', page: 2, filter: { search: 'secret' } } }), res);
    expect(mocks.snapshot).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u', filter: {} }));
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('记录 ID'));
  });
});

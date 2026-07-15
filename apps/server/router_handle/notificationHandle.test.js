import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: vi.fn(() => true) }));
vi.mock('../util/notification.js', () => ({ createNotification: vi.fn() }));

const { adminDelete } = await import('./notificationHandle.js');

const mockRes = () => ({ send: vi.fn() });

describe('通知中心管理员删除', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([{ affectedRows: 3 }]);
  });

  it('仅 root 可以删除通知批次', async () => {
    const res = mockRes();
    await adminDelete({ user: { role: 'user' }, body: { batchId: 'batch-1' } }, res);

    expect(query).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('缺少批次标识时拒绝执行', async () => {
    const res = mockRes();
    await adminDelete({ user: { role: 'root' }, body: {} }, res);

    expect(query).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('硬删除整批管理员通知，同时限制为 system/other 类型', async () => {
    const res = mockRes();
    await adminDelete({ user: { role: 'root' }, body: { batchId: 'batch-1' } }, res);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DELETE FROM notification');
    expect(sql).toContain('batch_id = ? OR id = ?');
    expect(sql).toContain('type IN (?,?)');
    expect(params).toEqual(['batch-1', 'batch-1', 'system', 'other']);
    expect(res.send).toHaveBeenCalledWith({ data: { deleted: 3 }, status: 200, msg: '' });
  });
});

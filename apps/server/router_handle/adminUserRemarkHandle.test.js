import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query } }));

// common.js 与 router/user.js 存在历史循环依赖，沿用其他 handler 测试的预加载方式。
await import('../util/common.js');
const { ADMIN_USER_REMARK_MAX_LENGTH, normalizeAdminUserRemark, saveAdminUserRemark } =
  await import('./adminUserRemarkHandle.js');

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('后台用户私有备注', () => {
  beforeEach(() => query.mockReset());

  it('规范化首尾与连续空白', () => {
    expect(normalizeAdminUserRemark('  测试\n  用户  ')).toBe('测试 用户');
  });

  it('非 Root 或管理员预览上下文均拒绝写入', async () => {
    const normalRes = mockRes();
    await saveAdminUserRemark({ user: { id: 'user-1', role: 'user' }, body: {} }, normalRes);
    expect(normalRes.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));

    const previewRes = mockRes();
    await saveAdminUserRemark(
      { user: { id: 'root-1', role: 'root' }, adminContext: { id: 'context-1' }, body: {} },
      previewRes,
    );
    expect(previewRes.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('拒绝缺少目标用户与超长备注', async () => {
    const missingTargetRes = mockRes();
    await saveAdminUserRemark({ user: { id: 'root-1', role: 'root' }, body: {} }, missingTargetRes);
    expect(missingTargetRes.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));

    const tooLongRes = mockRes();
    await saveAdminUserRemark(
      {
        user: { id: 'root-1', role: 'root' },
        body: { targetUserId: 'user-1', remarkName: 'a'.repeat(ADMIN_USER_REMARK_MAX_LENGTH + 1) },
      },
      tooLongRes,
    );
    expect(tooLongRes.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('备注只写入当前 Root 与目标用户的复合归属', async () => {
    query.mockResolvedValueOnce([[{ id: 'user-1' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await saveAdminUserRemark(
      {
        user: { id: 'root-1', role: 'root' },
        body: { targetUserId: 'user-1', remarkName: '  客户 A  ' },
      },
      res,
    );

    expect(query.mock.calls[1][0]).toContain('INSERT INTO admin_user_remarks');
    expect(query.mock.calls[1][1]).toEqual(['root-1', 'user-1', '客户 A']);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({ targetUserId: 'user-1', adminRemark: '客户 A' }),
      }),
    );
  });

  it('清空备注时删除当前 Root 自己的关系行', async () => {
    query.mockResolvedValueOnce([[{ id: 'user-1' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await saveAdminUserRemark(
      { user: { id: 'root-2', role: 'root' }, body: { targetUserId: 'user-1', remarkName: '  ' } },
      res,
    );

    expect(query.mock.calls[1][0]).toContain('DELETE FROM admin_user_remarks');
    expect(query.mock.calls[1][1]).toEqual(['root-2', 'user-1']);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, data: expect.objectContaining({ adminRemark: '' }) }),
    );
  });

  it('目标用户不存在时返回 404 且不写备注', async () => {
    query.mockResolvedValueOnce([[]]);
    const res = mockRes();

    await saveAdminUserRemark(
      { user: { id: 'root-1', role: 'root' }, body: { targetUserId: 'missing', remarkName: '备注' } },
      res,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });
});

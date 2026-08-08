import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection: vi.fn() } }));

await import('../util/common.js');
const { getUserList } = await import('./userHandle.js');

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('getUserList 私有备注隔离', () => {
  beforeEach(() => query.mockReset());

  it('列表与总数都只关联当前 Root 的备注，并支持按备注搜索', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
    const res = mockRes();

    await getUserList(
      {
        user: { id: 'root-current', role: 'root' },
        body: {
          cursor: null,
          limit: 50,
          filters: { key: '客户 A' },
          sort: { field: 'lastActiveTime', order: 'desc' },
        },
      },
      res,
    );

    const [listSql, listParams] = query.mock.calls[0];
    expect(listSql).toContain('LEFT JOIN admin_user_remarks aur');
    expect(listSql).toContain('aur.admin_user_id = ?');
    expect(listSql).toContain("COALESCE(aur.remark_name, '') AS admin_remark");
    expect(listSql).toContain("aur.remark_name LIKE CONCAT('%', ?, '%')");
    expect(listParams.slice(0, 4)).toEqual(['root-current', '客户 A', '客户 A', '客户 A']);

    const [totalSql, totalParams] = query.mock.calls[1];
    expect(totalSql).toContain('aur.admin_user_id = ?');
    expect(totalParams).toEqual(['root-current', '客户 A', '客户 A', '客户 A']);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, data: expect.objectContaining({ items: [], total: 0 }) }),
    );
  });
});

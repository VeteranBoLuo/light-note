import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  ensureUserOrAdminPolicy: vi.fn(() => true),
  getDerivedRelatedTags: vi.fn(() => []),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query } }));
vi.mock('../util/auth.js', () => ({ ensureUserOrAdminPolicy: mocks.ensureUserOrAdminPolicy }));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/services/tagRelationService.js', () => ({ getDerivedRelatedTags: mocks.getDerivedRelatedTags }));

const { getGlobalGraph, getTagGraph } = await import('./tagGraphHandle.js');

function response() {
  return { send: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
}

describe('标签图谱的管理员代看归属', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUserOrAdminPolicy.mockReturnValue(true);
  });

  it('单标签图谱使用 subject 用户', async () => {
    mocks.query.mockResolvedValueOnce([[{ id: 'tag-1', name: '产品', icon_url: '' }]]);
    await getTagGraph(
      {
        user: { id: 'root-1' },
        resourceUser: { id: 'subject-1' },
        adminContext: { mode: 'readonly' },
        adminCapability: { policy: 'read' },
        body: { tagId: 'tag-1', includeResources: false },
      },
      response(),
    );
    expect(mocks.query.mock.calls[0][1]).toEqual(['tag-1', 'subject-1']);
    expect(mocks.getDerivedRelatedTags).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'subject-1', tagId: 'tag-1' }),
    );
  });

  it('全局图谱统计也使用 subject 用户', async () => {
    mocks.query.mockResolvedValue([[]]);
    await getGlobalGraph(
      {
        user: { id: 'root-1' },
        resourceUser: { id: 'subject-1' },
        adminContext: { mode: 'readonly' },
        adminCapability: { policy: 'read' },
        body: {},
      },
      response(),
    );
    expect(mocks.query.mock.calls.length).toBeGreaterThan(5);
    expect(
      mocks.query.mock.calls.every(([, params]) => !params || !params.length || params.includes('subject-1')),
    ).toBe(true);
    const tagCountSql = mocks.query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('AS resource_count'));
    const coOccurrenceSql = mocks.query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('a.tag_id AS t1'));
    expect(tagCountSql).toContain('global_tag_bookmark.del_flag = 0');
    expect(tagCountSql).toContain('global_tag_note.del_flag = 0');
    expect(tagCountSql).toContain('global_tag_file.del_flag = 0');
    expect(coOccurrenceSql).toContain('global_pair_bookmark.id IS NOT NULL');
    expect(coOccurrenceSql).toContain('global_pair_note.id IS NOT NULL');
    expect(coOccurrenceSql).toContain('global_pair_file.id IS NOT NULL');
  });

  it('图谱查询失败时不把数据库原始错误返回客户端', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.query.mockRejectedValueOnce(new Error('sensitive database detail'));
    const res = response();

    await getTagGraph(
      {
        user: { id: 'user-1' },
        body: { tagId: 'tag-1' },
      },
      res,
    );

    expect(res.send).toHaveBeenCalledWith({
      data: null,
      status: 500,
      msg: '获取标签图谱失败，请稍后重试',
    });
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('sensitive database detail');
    consoleSpy.mockRestore();
  });
});

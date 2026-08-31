import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDerivedRelatedTags: vi.fn(),
}));

vi.mock('./tagRelationService.js', () => ({
  getDerivedRelatedTags: mocks.getDerivedRelatedTags,
}));

const { getTagSpaceOverview, queryTagSpaceList, queryTagSpaceResources } = await import('./tagSpaceService.js');

describe('tagSpaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('在数据库分页并只统计仍存在且属于当前用户的资源', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'tag-1',
              name: '产品 50%_!',
              description: '产品资料与阶段结论',
              icon_url: '',
              sort: 2,
              bookmark_count: 2,
              note_count: 1,
              file_count: 1,
              last_activity_time: '2026-08-28 10:00:00',
              bookmark_preview: JSON.stringify({
                type: 'bookmark',
                id: 'bookmark-1',
                title: '需求说明',
                url: 'https://example.com',
              }),
              note_preview: Buffer.from(JSON.stringify({ type: 'note', id: 'note-1', title: '评审结论' })),
              file_preview: { type: 'file', id: 'file-1', title: '方案.pdf', fileSize: 1024 },
            },
          ],
        ])
        .mockResolvedValueOnce([[{ tag_count: 3, active_count: 2, bookmark_count: 2, note_count: 1, file_count: 1 }]])
        .mockResolvedValueOnce([[{ tag_count: 9, active_count: 6, bookmark_count: 5, note_count: 4, file_count: 2 }]])
        .mockResolvedValueOnce([[{ bookmark_count: 8, note_count: 5, file_count: 3 }]]),
    };

    const result = await queryTagSpaceList(db, {
      userId: 'user-1',
      keyword: '50%_!',
      filter: 'bookmark',
      sort: 'recent',
      page: 2,
      pageSize: 10,
    });

    const [listSql, listParams] = db.query.mock.calls[0];
    expect(listSql).toContain('LEFT JOIN bookmark b');
    expect(listSql).toContain('b.user_id = r.user_id');
    expect(listSql).toContain('LEFT JOIN note n');
    expect(listSql).toContain('n.create_by = r.user_id');
    expect(listSql).toContain('LEFT JOIN files f');
    expect(listSql).toContain('f.create_by = r.user_id');
    expect(listSql).toContain('COALESCE(stats.bookmark_count, 0) > 0');
    expect(listSql).toContain('ORDER BY stats.last_activity_time IS NULL ASC');
    expect(listSql).toContain('LIMIT ? OFFSET ?');
    expect(listParams).toEqual([
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      '%50!%!_!!%',
      '%50!%!_!!%',
      10,
      10,
    ]);
    expect(result).toMatchObject({
      total: 2,
      page: 2,
      pageSize: 10,
      hasMore: false,
      overview: {
        tagTotal: 9,
        activeTagTotal: 6,
        emptyTagTotal: 3,
        covered: { bookmark: 8, note: 5, file: 3 },
      },
    });
    expect(result.items[0]).toMatchObject({
      id: 'tag-1',
      description: '产品资料与阶段结论',
      counts: { bookmark: 2, note: 1, file: 1, total: 4 },
    });
    expect(result.items[0].previewResources).toHaveLength(3);
  });

  it('默认空间列表隐藏空标签，但详情仍允许读取空标签', async () => {
    const listDb = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ tag_count: 2, active_count: 0, bookmark_count: 0, note_count: 0, file_count: 0 }]])
        .mockResolvedValueOnce([[{ bookmark_count: 0, note_count: 0, file_count: 0 }]]),
    };
    await queryTagSpaceList(listDb, { userId: 'user-1' });
    expect(listDb.query.mock.calls[0][0]).toContain('COALESCE(stats.file_count, 0)\n  ) > 0');
    expect(listDb.query.mock.calls[0][0]).toContain('ORDER BY stats.last_activity_time IS NULL ASC');

    const detailDb = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            id: 'empty-tag',
            name: '待整理',
            bookmark_count: 0,
            note_count: 0,
            file_count: 0,
          },
        ],
      ]),
    };
    mocks.getDerivedRelatedTags.mockResolvedValue([]);
    const detail = await getTagSpaceOverview(detailDb, { userId: 'user-1', tagId: 'empty-tag' });
    expect(detail.tag.counts.total).toBe(0);
    expect(detailDb.query.mock.calls[0][0]).toContain('t.user_id = ? AND t.id = ?');
    expect(detailDb.query.mock.calls[0][1]).toEqual(['user-1', 'user-1', 'empty-tag']);
  });

  it('按契约显式包含空标签时不改变其它筛选语义', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ tag_count: 4, active_count: 2, bookmark_count: 1, note_count: 1, file_count: 0 }]])
        .mockResolvedValueOnce([[{ bookmark_count: 1, note_count: 1, file_count: 0 }]]),
    };
    const result = await queryTagSpaceList(db, { userId: 'user-1', includeEmpty: true });
    expect(db.query.mock.calls[0][0]).toContain('AND 1 = 1');
    expect(result).toMatchObject({ total: 4, includeEmpty: true, facets: { all: 4, empty: 2 } });
  });

  it('空标签使用服务端计数筛选，不需要回退旧全量标签管理接口', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ tag_count: 4, active_count: 2, bookmark_count: 1, note_count: 1, file_count: 0 }]])
        .mockResolvedValueOnce([[{ bookmark_count: 1, note_count: 1, file_count: 0 }]]),
    };
    const result = await queryTagSpaceList(db, {
      userId: 'user-1',
      includeEmpty: true,
      filter: 'empty',
    });
    expect(db.query.mock.calls[0][0]).toContain('COALESCE(stats.file_count, 0)\n    ) = 0');
    expect(result).toMatchObject({
      total: 2,
      filter: 'empty',
      facets: { all: 4, empty: 2 },
    });
  });

  it('先合并三类资源再按加入标签时间统一分页，不按类型分段', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'tag-1' }]])
        .mockResolvedValueOnce([[{ total: 140 }]])
        .mockResolvedValueOnce([
          [
            {
              resource_type: 'note',
              id: 'note-1',
              title: '产品方案',
              summary: '<p>评审结论</p>',
              create_time: '2026-08-20 10:00:00',
              update_time: '2026-08-28 10:00:00',
              added_time: '2026-08-27 10:00:00',
            },
          ],
        ])
        .mockResolvedValueOnce([[{ resource_type: 'note', resource_id: 'note-1', id: 'tag-2', name: '评审' }]]),
    };

    const result = await queryTagSpaceResources(db, {
      userId: 'user-1',
      tagId: 'tag-1',
      keyword: '50%_!',
      type: 'all',
      sort: 'added',
      page: 2,
      pageSize: 999,
    });

    const [countSql] = db.query.mock.calls[1];
    const [rowSql, rowParams] = db.query.mock.calls[2];
    expect(countSql.match(/UNION ALL/g)).toHaveLength(2);
    expect(countSql).toContain("r.resource_type = 'bookmark'");
    expect(countSql).toContain("r.resource_type = 'note'");
    expect(countSql).toContain("r.resource_type = 'file'");
    expect(rowSql).toMatch(/CONVERT\(b\.id USING utf8mb4\) COLLATE utf8mb4_unicode_ci AS id/u);
    expect(rowSql).toMatch(/CONVERT\(b\.name USING utf8mb4\) COLLATE utf8mb4_unicode_ci AS title/u);
    expect(rowSql).toMatch(/CONVERT\(n\.id USING utf8mb4\) COLLATE utf8mb4_unicode_ci AS id/u);
    expect(rowSql).toMatch(/CONVERT\(n\.title USING utf8mb4\) COLLATE utf8mb4_unicode_ci AS title/u);
    expect(rowSql).toMatch(/CONVERT\(f\.id USING utf8mb4\) COLLATE utf8mb4_unicode_ci AS id/u);
    expect(rowSql).toMatch(/CONVERT\(f\.file_name USING utf8mb4\) COLLATE utf8mb4_unicode_ci AS title/u);
    expect(rowSql).toContain('ORDER BY added_time DESC, resource_type ASC, id DESC');
    expect(rowSql).toContain('LIMIT ? OFFSET ?');
    expect(rowParams.slice(-2)).toEqual([50, 50]);
    expect(rowParams).toContain('%50!%!_!!%');
    expect(result).toMatchObject({ total: 140, page: 2, pageSize: 50, hasMore: true, sort: 'added' });
    expect(result.items[0]).toMatchObject({
      id: 'note-1',
      type: 'note',
      description: '评审结论',
      tags: [{ id: 'tag-2', name: '评审' }],
    });
  });

  it('精确标签不属于当前用户时直接返回不存在', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([[]]) };
    await expect(queryTagSpaceResources(db, { userId: 'user-1', tagId: 'other-tag' })).resolves.toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('拒绝缺失用户身份，避免无归属地扫描标签表', async () => {
    await expect(queryTagSpaceList({ query: vi.fn() }, {})).rejects.toThrow('USER_REQUIRED');
  });
});

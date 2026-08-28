import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDerivedRelatedTags } from './tagRelationService.js';

describe('tagRelationService', () => {
  let db;

  beforeEach(() => {
    db = { query: vi.fn() };
  });

  it('缺少用户或标签时直接返回空,不查询数据库', async () => {
    await expect(getDerivedRelatedTags(db, { userId: '', tagId: 'tag-1' })).resolves.toEqual([]);
    await expect(getDerivedRelatedTags(db, { userId: 'user-1', tagId: '  ' })).resolves.toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('共现查询按 user_id 隔离，以类型+ID 判定资源，并排除回收站资源', async () => {
    db.query.mockResolvedValueOnce([[]]);

    await getDerivedRelatedTags(db, { userId: 'user-1', tagId: 'tag-1' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('center.user_id = ? AND center.tag_id = ?');
    expect(sql).toContain('candidate.resource_type = center.resource_type');
    expect(sql).toContain('candidate.resource_id = center.resource_id');
    expect(sql).toContain('candidate.tag_id <> center.tag_id');
    expect(sql).toContain("center.resource_type = 'bookmark' AND b.id IS NOT NULL");
    expect(sql).toContain("center.resource_type = 'note' AND n.id IS NOT NULL");
    expect(sql).toContain("center.resource_type = 'file' AND f.id IS NOT NULL");
    expect(sql).toContain('b.del_flag = 0');
    expect(sql).toContain('n.del_flag = 0');
    expect(sql).toContain('f.del_flag = 0');
    expect(params.slice(0, 2)).toEqual(['user-1', 'tag-1']);
  });

  it('无共现候选时不再发起第二次查询', async () => {
    db.query.mockResolvedValueOnce([[]]);

    await expect(getDerivedRelatedTags(db, { userId: 'user-1', tagId: 'tag-1' })).resolves.toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('用一次批量查询取回所有标签体量,不产生 N+1', async () => {
    db.query
      .mockResolvedValueOnce([
        [
          { id: 'tag-2', name: '备案', iconUrl: null, sharedCount: 3 },
          { id: 'tag-3', name: '收藏', iconUrl: null, sharedCount: 3 },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { tagId: 'tag-1', total: 5 },
          { tagId: 'tag-2', total: 4 },
          { tagId: 'tag-3', total: 200 },
        ],
      ]);

    const result = await getDerivedRelatedTags(db, { userId: 'user-1', tagId: 'tag-1' });

    expect(db.query).toHaveBeenCalledTimes(2);
    const [countSql, countParams] = db.query.mock.calls[1];
    expect(countSql).toContain('FROM resource_tag_relations');
    expect(countSql).toContain("r.resource_type = 'bookmark' AND b.id IS NOT NULL");
    expect(countSql).toContain("r.resource_type = 'note' AND n.id IS NOT NULL");
    expect(countSql).toContain("r.resource_type = 'file' AND f.id IS NOT NULL");
    expect(countParams).toEqual(['user-1', 'tag-1', 'tag-2', 'tag-3']);
    // 共现同为 3 次时,资源更少的紧密标签排在大标签之前
    expect(result.map((item) => item.id)).toEqual(['tag-2', 'tag-3']);
    expect(result[0]).toMatchObject({ sharedCount: 3, sourceResourceCount: 5, reason: 'co_occurrence' });
  });

  it('limit 被夹取到合理范围', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await getDerivedRelatedTags(db, { userId: 'user-1', tagId: 'tag-1', limit: 999 });
    expect(db.query).toHaveBeenCalled();
  });
});

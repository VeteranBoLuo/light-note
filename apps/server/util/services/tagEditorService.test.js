import { describe, expect, it, vi } from 'vitest';
import { getTagEditorBootstrap } from './tagEditorService.js';

describe('tagEditorService', () => {
  it('编辑态只读取表单所需轻量字段，并一次返回候选资源与已选关系', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'tag-1',
              name: '项目资料',
              description: '项目相关内容',
              icon_url: '',
              sort: 0,
              create_time: '2026-08-28 10:00:00',
            },
          ],
        ])
        .mockResolvedValueOnce([[{ id: 'bookmark-1', name: '需求文档' }]])
        .mockResolvedValueOnce([[{ id: 'note-1', title: '评审纪要' }]])
        .mockResolvedValueOnce([[{ id: 7, file_name: '方案.pdf' }]])
        .mockResolvedValueOnce([
          [
            { resource_type: 'bookmark', resource_id: 'bookmark-1' },
            { resource_type: 'bookmark', resource_id: 'deleted-bookmark' },
            { resource_type: 'file', resource_id: '7' },
          ],
        ]),
    };

    const result = await getTagEditorBootstrap(db, { userId: 'user-1', tagId: 'tag-1' });

    expect(db.query).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      tag: expect.objectContaining({ id: 'tag-1', name: '项目资料' }),
      resources: [
        { rawId: 'bookmark-1', name: '需求文档', type: 'bookmark' },
        { rawId: 'note-1', name: '评审纪要', type: 'note' },
        { rawId: '7', name: '方案.pdf', type: 'file' },
      ],
      selectedIds: {
        bookmark: ['bookmark-1'],
        note: [],
        file: ['7'],
      },
    });

    const sql = db.query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).not.toContain('SELECT *');
    expect(sql).not.toContain('JSON_ARRAYAGG');
    expect(sql).not.toContain('n.content');
    expect(sql).not.toContain('bookmark_snapshot');
    expect(sql).toContain('b.user_id = ? AND b.del_flag = 0');
    expect(sql).toContain('n.create_by = ? AND n.del_flag = 0');
    expect(sql).toContain('f.create_by = ? AND f.del_flag = 0');
    expect(sql).toContain('r.user_id = ? AND r.tag_id = ?');
  });

  it('新增态跳过标签详情与关系查询，只加载三类轻量候选资源', async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]),
    };

    const result = await getTagEditorBootstrap(db, { userId: 'user-1' });

    expect(db.query).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      tag: null,
      resources: [],
      selectedIds: { bookmark: [], note: [], file: [] },
    });
  });

  it('编辑他人或不存在的标签时不返回候选数据', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]),
    };

    await expect(getTagEditorBootstrap(db, { userId: 'user-1', tagId: 'other-tag' })).resolves.toBeNull();
    expect(db.query.mock.calls[0][0]).toContain('t.id = ? AND t.user_id = ?');
    expect(db.query.mock.calls[0][1]).toEqual(['other-tag', 'user-1']);
  });

  it('拒绝缺失用户身份，避免无归属读取全量资源', async () => {
    const db = { query: vi.fn() };
    await expect(getTagEditorBootstrap(db, {})).rejects.toThrow('USER_REQUIRED');
    expect(db.query).not.toHaveBeenCalled();
  });
});

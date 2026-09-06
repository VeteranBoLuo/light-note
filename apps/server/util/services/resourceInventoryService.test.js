import { describe, expect, it, vi } from 'vitest';
import { countUntaggedResources, listUntaggedResources } from './resourceInventoryService.js';

describe('resourceInventoryService.listUntaggedResources', () => {
  it('统一按归属、未删除和有效标签关系筛选三类资源，且不读取笔记正文', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([
        [
          {
            resource_type: 'note',
            id: 'note-2',
            title: '第二篇',
            summary: '',
            url: '',
            created_at: '2026-08-30 10:00:00',
            updated_at: '2026-08-30 10:00:00',
            sort_time: '2026-08-30 10:00:00',
          },
          {
            resource_type: 'bookmark',
            id: 'bookmark-1',
            title: '第一条',
            summary: '',
            url: 'https://example.com',
            created_at: '2026-08-29 10:00:00',
            updated_at: '2026-08-29 10:00:00',
            sort_time: '2026-08-29 10:00:00',
          },
        ],
      ]),
    };

    const result = await listUntaggedResources(db, { userId: 'user-1', limit: 1 });
    const [sql, params] = db.query.mock.calls[0];

    expect(sql).toContain('b.user_id = ?');
    expect(sql).toContain('n.create_by = ?');
    expect(sql).toContain('f.create_by = ?');
    expect(sql).toContain('untagged_tag.del_flag = 0');
    expect(sql).toContain("suppression.issue_type = 'untagged.ignore'");
    expect(sql).toContain('b.create_time AS updated_at');
    expect(sql).not.toContain('b.update_time');
    expect(sql).not.toMatch(/n\.content|note_versions|LONGTEXT/i);
    expect(params.filter((value) => value === 'user-1').length).toBeGreaterThanOrEqual(10);
    expect(result).toMatchObject({
      items: [expect.objectContaining({ resourceType: 'note', resourceId: 'note-2' })],
      hasMore: true,
      nextCursor: expect.any(String),
    });
  });

  it('分页游标绑定当前筛选，筛选变化后拒绝复用旧位置', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([
        [
          {
            resource_type: 'bookmark',
            id: 'bookmark-2',
            title: 'B',
            summary: '',
            url: 'https://b.example',
            created_at: '2026-08-30 10:00:00',
            updated_at: '2026-08-30 10:00:00',
            sort_time: '2026-08-30 10:00:00',
          },
          {
            resource_type: 'bookmark',
            id: 'bookmark-1',
            title: 'A',
            summary: '',
            url: 'https://a.example',
            created_at: '2026-08-29 10:00:00',
            updated_at: '2026-08-29 10:00:00',
            sort_time: '2026-08-29 10:00:00',
          },
        ],
      ]),
    };
    const first = await listUntaggedResources(db, {
      userId: 'user-1',
      resourceType: 'bookmark',
      keyword: 'demo',
      limit: 1,
    });

    await expect(
      listUntaggedResources(db, {
        userId: 'user-1',
        resourceType: 'bookmark',
        keyword: 'changed',
        cursor: first.nextCursor,
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZE_CURSOR_INVALID' });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('精确计数复用书签、笔记、文件联合口径并排除已忽略项', async () => {
    const db = { query: vi.fn().mockResolvedValue([[{ total: 17 }]]) };

    await expect(countUntaggedResources(db, { userId: 'user-1' })).resolves.toBe(17);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("SELECT 'bookmark' AS resource_type");
    expect(sql).toContain("SELECT 'note' AS resource_type");
    expect(sql).toContain("SELECT 'file' AS resource_type");
    expect(sql).toContain('untagged_tag.del_flag = 0');
    expect(sql).toContain("suppression.issue_type = 'untagged.ignore'");
    expect(params.at(-1)).toBe('user-1');
  });
});

describe('无标签总览统计', () => {
  it('按完整资源聚合类型，不使用用于跨问题去重的截断键推算数量', async () => {
    const { getUntaggedSummary } = await import('./resourceInventoryService.js');
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            { resource_type: 'bookmark', id: '1' },
            { resource_type: 'note', id: '2' },
          ],
        ])
        .mockResolvedValueOnce([[{ total: 191, bookmarkCount: 3, noteCount: 33, fileCount: 155, revision: 'rev' }]]),
    };
    const result = await getUntaggedSummary(db, { userId: 'owner', maxKeys: 1 });
    expect(result).toMatchObject({
      findingCount: 191,
      affectedResourceCount: 191,
      typeTotals: { bookmark: 3, note: 33, file: 155 },
      resourceKeys: ['bookmark:1'],
      exact: false,
      hasMore: true,
    });
    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toContain("SUM(inventory.resource_type = 'file')");
    expect(sql).toContain("suppression.issue_type = 'untagged.ignore'");
    expect(params).toContain('owner');
    expect(sql).not.toContain('LIMIT');
  });
});

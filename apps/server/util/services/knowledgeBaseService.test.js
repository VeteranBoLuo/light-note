import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const pool = { getConnection: vi.fn(() => connection), query: vi.fn() };
const cacheMocks = vi.hoisted(() => ({ invalidateKnowledgeCache: vi.fn() }));
vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('../knowledgeService.js', () => cacheMocks);

const { upsertKnowledgeBase, updateKnowledgeBaseById } = await import('./knowledgeBaseService.js');

describe('knowledgeBaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.beginTransaction.mockResolvedValue();
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
  });

  it('同名条目走更新，不额外创建重复数据', async () => {
    connection.query
      .mockResolvedValueOnce([[{ id: 'kb-1', title: '说明' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await upsertKnowledgeBase({
      userId: 'root-1',
      input: { title: '说明', content: '新正文', status: 'internal', type: 'markdown' },
    });
    expect(result).toEqual({ id: 'kb-1', title: '说明', action: 'updated' });
    expect(connection.query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO knowledge_base'))).toBe(
      false,
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(cacheMocks.invalidateKnowledgeCache).toHaveBeenCalledTimes(1);
  });

  it('帮助文章脚本更新未显式栏目时保留既有栏目，非帮助知识不保留展示栏目', async () => {
    connection.query
      .mockResolvedValueOnce([[{ id: 'kb-1', title: '说明', help_section: '笔记与编辑' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await upsertKnowledgeBase({
      userId: 'root-1',
      input: { title: '说明', content: '正文', category: '帮助中心', status: 'public', type: 'markdown' },
    });

    expect(connection.query.mock.calls[1][1]).toContain('笔记与编辑');

    vi.clearAllMocks();
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await updateKnowledgeBaseById({
      userId: 'root-1',
      id: 'kb-1',
      patch: { category: '内部知识', helpSection: '不应保留' },
    });
    expect(connection.query.mock.calls[0][1]).toContain(null);
  });

  it('新建帮助文章未填写栏目时写入其他帮助', async () => {
    connection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ next_sort: 3 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await upsertKnowledgeBase({
      userId: 'root-1',
      input: { title: '新文章', content: '正文', category: '帮助中心', status: 'public', type: 'markdown' },
    });

    expect(connection.query.mock.calls[2][1]).toContain('其他帮助');
  });

  it('事务提交失败时不会提前清理索引缓存', async () => {
    connection.query
      .mockResolvedValueOnce([[{ id: 'kb-1', title: '说明' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    connection.commit.mockRejectedValueOnce(new Error('commit failed'));

    await expect(
      upsertKnowledgeBase({
        userId: 'root-1',
        input: { title: '说明', content: '新正文', status: 'internal', type: 'markdown' },
      }),
    ).rejects.toThrow('commit failed');

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(cacheMocks.invalidateKnowledgeCache).not.toHaveBeenCalled();
  });

  it('拒绝非法状态和类型', async () => {
    await expect(
      upsertKnowledgeBase({ userId: 'root-1', input: { title: '说明', status: 'draft', type: 'markdown' } }),
    ).rejects.toThrow('INVALID_STATUS');
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('按 ID 更新时拒绝同名冲突', async () => {
    connection.query.mockResolvedValueOnce([[{ id: 'kb-2' }]]);
    await expect(updateKnowledgeBaseById({ userId: 'root-1', id: 'kb-1', patch: { title: '重复' } })).rejects.toThrow(
      'DUPLICATE_TITLE',
    );
  });

  it('按 ID 更新成功后立即清理索引缓存', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      updateKnowledgeBaseById({ userId: 'root-1', id: 'kb-1', patch: { content: '已更新' } }),
    ).resolves.toEqual({ id: 'kb-1' });

    expect(cacheMocks.invalidateKnowledgeCache).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});

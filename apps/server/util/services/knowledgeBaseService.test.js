import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const pool = { getConnection: vi.fn(() => connection), query: vi.fn() };
vi.mock('../../db/index.js', () => ({ default: pool }));

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
  });

  it('拒绝非法状态和类型', async () => {
    await expect(
      upsertKnowledgeBase({ userId: 'root-1', input: { title: '说明', status: 'draft', type: 'markdown' } }),
    ).rejects.toThrow('INVALID_STATUS');
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('按 ID 更新时拒绝同名冲突', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 'kb-2' }]]);
    await expect(updateKnowledgeBaseById({ userId: 'root-1', id: 'kb-1', patch: { title: '重复' } })).rejects.toThrow(
      'DUPLICATE_TITLE',
    );
  });
});

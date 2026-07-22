import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

const { createAiMemoryCandidate, deleteAiMemory } = await import('./aiMemoryService.js');

const identity = {
  actorUserId: 'user-1',
  subjectUserId: 'user-1',
  actorRole: 'user',
  subjectRole: 'user',
  adminContextId: null,
  adminContextMode: 'normal',
};

describe('关闭长期记忆后的服务端入口', () => {
  it('直接调用候选写入服务也会被全局开关拒绝', async () => {
    const database = { getConnection: vi.fn() };

    await expect(createAiMemoryCandidate(identity, { content: '不应写入' }, database)).rejects.toMatchObject({
      code: 'AI_MEMORY_DISABLED',
      status: 409,
    });
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('仍允许删除关闭前留下的长期记忆', async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);

    await expect(deleteAiMemory(identity, 'memory-1', { query })).resolves.toEqual({ id: 'memory-1', deleted: 1 });
    expect(query).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const pool = { getConnection: vi.fn(() => connection) };
const enqueueResources = vi.fn();
const triggerResourceCreateEffects = vi.fn();

vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('../resourceInbox.js', () => ({ enqueueResources }));
vi.mock('./resourceCreateEffects.js', () => ({ triggerResourceCreateEffects }));

const { createNote } = await import('./noteService.js');

describe('noteService.createNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.beginTransaction.mockResolvedValue();
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
    enqueueResources.mockResolvedValue({ changed: 1 });
  });

  it('只落 html/markdown 类型，并把创建与待整理入队放进同一事务', async () => {
    const result = await createNote({
      userId: 'user-1',
      userRole: 'user',
      note: { id: '', title: '收集', content: '# 正文', type: 'markdown' },
      addToInbox: true,
      request: { user: { id: 'user-1' } },
    });
    const inserted = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO note SET ?')?.[1]?.[0];
    expect(inserted.id).toBeTruthy();
    expect(inserted.type).toBe('markdown');
    expect(enqueueResources).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ userId: 'user-1', items: [{ resourceType: 'note', resourceId: result.id }] }),
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(triggerResourceCreateEffects).toHaveBeenCalledWith(expect.objectContaining({ resourceId: result.id }));
  });

  it('非法历史类型在写库前失败', async () => {
    await expect(createNote({ userId: 'user-1', note: { title: '坏类型', type: 'richtext' } })).rejects.toThrow(
      'INVALID_NOTE_TYPE',
    );
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});

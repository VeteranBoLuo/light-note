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

  it('源笔记已彻底删除、图片仅剩模板引用时,用模板新建的笔记仍登记图片引用(跨生命周期)', async () => {
    const imgUrl = 'https://boluo66.top/uploads/note-1-a.png';
    connection.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM note_images')) return [[]]; // 源笔记已删,note_images 无归属行
      if (sql.includes('FROM note_template')) return [[{ n: 1 }]]; // 归属由用户自己的模板正文兜住
      return [{ affectedRows: 1 }];
    });
    await createNote({
      userId: 'user-1',
      userRole: 'user',
      note: { title: '由模板创建', content: `<img src="${imgUrl}">`, type: 'html' },
      request: { user: { id: 'user-1' } },
    });
    const imageInsert = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO note_images SET ?');
    expect(imageInsert).toBeTruthy();
    expect(imageInsert[1][0].url).toBe(imgUrl); // 新笔记成为该图片的合法引用者,后续清理不会误删
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});

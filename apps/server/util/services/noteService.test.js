import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const pool = { getConnection: vi.fn(() => connection), query: vi.fn() };
const enqueueResources = vi.fn();
const triggerResourceCreateEffects = vi.fn();
// 笔记内联提及(N0):隔离引用同步钩子,让本文件既有用例不触发真实关系查询;
// sync 自身逻辑由 noteReferenceService.test.js 覆盖。默认 extract 返回空集合(既有用例正文无站内链接)。
const extractOwnedResourceRefs = vi.fn(() => []);
const syncNoteResourceRefs = vi.fn(async () => ({ inserted: 0, deleted: 0 }));

vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('../resourceInbox.js', () => ({ enqueueResources }));
vi.mock('./resourceCreateEffects.js', () => ({ triggerResourceCreateEffects }));
vi.mock('./noteReferenceService.js', () => ({ extractOwnedResourceRefs, syncNoteResourceRefs }));

const { applyOwnedNoteContentChange, createNote } = await import('./noteService.js');
const { actionIdempotencyUuid } = await import('../agent/actionIdempotency.js');

describe('noteService.createNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.beginTransaction.mockResolvedValue();
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
    pool.query.mockReset();
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

  it('已由内部服务验证并刚写入的图片可随新笔记在同一事务登记', async () => {
    const imgUrl = 'https://boluo66.top/uploads/note-ai-safe.png';
    connection.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM note_images')) return [[]];
      if (sql.includes('FROM note_template')) return [[{ n: 0 }]];
      return [{ affectedRows: 1 }];
    });
    await createNote({
      userId: 'user-1',
      userRole: 'user',
      note: { title: '图片笔记', content: `<img src="${imgUrl}">`, type: 'html' },
      trustedImageUrls: [imgUrl, 'https://boluo66.top/uploads/not-in-content.png'],
    });
    const imageInserts = connection.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO note_images SET ?');
    expect(imageInserts).toHaveLength(1);
    expect(imageInserts[0][1][0].url).toBe(imgUrl);
  });

  it('commit 已落库但回包异常时按服务端 UUID 和用户核验后返回成功', async () => {
    connection.commit.mockRejectedValueOnce(new Error('commit response lost'));
    pool.query.mockImplementationOnce(async (sql, params) => {
      expect(sql).toBe('SELECT id FROM note WHERE id = ? AND create_by = ? LIMIT 1');
      expect(params[1]).toBe('user-1');
      return [[{ id: params[0] }]];
    });

    const result = await createNote({
      userId: 'user-1',
      userRole: 'user',
      note: { title: '提交结果核验', content: '', type: 'html' },
    });

    expect(result.id).toBeTruthy();
    expect(pool.query).toHaveBeenCalledWith('SELECT id FROM note WHERE id = ? AND create_by = ? LIMIT 1', [
      result.id,
      'user-1',
    ]);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(triggerResourceCreateEffects).toHaveBeenCalledWith(expect.objectContaining({ resourceId: result.id }));
  });

  it('commit 失败且事务外核验无记录时保留原异常并判定为真实回滚', async () => {
    const commitError = new Error('commit rejected');
    connection.commit.mockRejectedValueOnce(commitError);
    pool.query.mockResolvedValueOnce([[]]);

    await expect(
      createNote({ userId: 'user-1', note: { title: '未提交笔记', content: '', type: 'html' } }),
    ).rejects.toBe(commitError);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(triggerResourceCreateEffects).not.toHaveBeenCalled();
  });

  it('commit 后无法核验时标记结果不明，供外部资源调用方禁止误删', async () => {
    const commitError = new Error('commit response lost');
    connection.commit.mockRejectedValueOnce(commitError);
    pool.query.mockRejectedValueOnce(new Error('verification unavailable'));

    await expect(
      createNote({ userId: 'user-1', note: { title: '待核验笔记', content: '', type: 'html' } }),
    ).rejects.toMatchObject({ commitOutcomeUnknown: true });

    expect(triggerResourceCreateEffects).not.toHaveBeenCalled();
  });

  it('非 Error 的 commit 异常在核验不可用时仍可靠标记结果不明', async () => {
    connection.commit.mockRejectedValueOnce('commit response lost');
    pool.query.mockRejectedValueOnce(new Error('verification unavailable'));

    await expect(
      createNote({ userId: 'user-1', note: { title: '异常类型兼容', content: '', type: 'html' } }),
    ).rejects.toMatchObject({ commitOutcomeUnknown: true, cause: 'commit response lost' });
  });

  it('笔记已提交后旁路副作用同步抛错仍返回成功', async () => {
    triggerResourceCreateEffects.mockImplementationOnce(() => {
      throw new Error('side effect failed');
    });

    await expect(
      createNote({ userId: 'user-1', note: { title: '主事务已完成', content: '', type: 'html' } }),
    ).resolves.toMatchObject({ title: '主事务已完成' });

    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('提交前写入失败时直接回滚，不执行提交后核验', async () => {
    const insertError = new Error('insert failed');
    connection.query.mockRejectedValueOnce(insertError);

    await expect(createNote({ userId: 'user-1', note: { title: '写入失败', content: '', type: 'html' } })).rejects.toBe(
      insertError,
    );

    expect(connection.commit).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('提交结果不明后以稳定笔记 ID 恢复，重新确认不再插入第二条笔记', async () => {
    const idempotencyKey = 'agent-write-v1:retry-after-unknown-commit';
    const stableId = actionIdempotencyUuid(idempotencyKey, 'note');
    connection.commit.mockRejectedValueOnce(new Error('commit response lost'));
    pool.query
      .mockResolvedValueOnce([[]])
      .mockRejectedValueOnce(new Error('verification unavailable'))
      .mockResolvedValueOnce([[{ id: stableId, title: '已落库笔记', type: 'markdown' }]]);

    await expect(
      createNote({
        userId: 'user-1',
        userRole: 'user',
        note: { title: '已落库笔记', content: '正文', type: 'markdown' },
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ commitOutcomeUnknown: true });

    await expect(
      createNote({
        userId: 'user-1',
        userRole: 'user',
        note: { title: '已落库笔记', content: '正文', type: 'markdown' },
        idempotencyKey,
      }),
    ).resolves.toEqual({ id: stableId, title: '已落库笔记', type: 'markdown', addedToInbox: false });

    expect(connection.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO note SET ?')).toHaveLength(1);
    expect(pool.getConnection).toHaveBeenCalledTimes(1);
  });
});

describe('noteService.applyOwnedNoteContentChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('在同一事务内再次校验 owner/正文版本，先保存历史再写入新正文', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT title, content, type FROM note')) {
        return [[{ title: '目标笔记', content: '旧正文', type: 'markdown' }]];
      }
      if (sql.startsWith('SELECT id FROM note_versions')) return [[]];
      if (sql.startsWith('UPDATE note SET content')) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    });

    await expect(
      applyOwnedNoteContentChange(connection, {
        userId: 'subject-1',
        actorUserId: 'actor-1',
        noteId: 'note-1',
        before: { title: '目标笔记', content: '旧正文', type: 'markdown' },
        after: { title: '目标笔记', content: '旧正文\n\n新增内容', type: 'markdown' },
      }),
    ).resolves.toEqual({ title: '目标笔记', content: '旧正文\n\n新增内容', type: 'markdown' });

    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE'),
      ['note-1', 'subject-1'],
    );
    const snapshot = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO note_versions SET ?')?.[1]?.[0];
    expect(snapshot).toMatchObject({ note_id: 'note-1', content: '旧正文', create_by: 'subject-1' });
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE note SET content = ?'), [
      '旧正文\n\n新增内容',
      'markdown',
      'actor-1',
      'note-1',
      'subject-1',
    ]);
  });

  it('正文与预览快照不一致时拒绝写入，不生成历史快照', async () => {
    connection.query.mockResolvedValueOnce([[{ title: '目标笔记', content: '用户刚刚编辑', type: 'markdown' }]]);

    await expect(
      applyOwnedNoteContentChange(connection, {
        userId: 'subject-1',
        noteId: 'note-1',
        before: { title: '目标笔记', content: '旧正文', type: 'markdown' },
        after: { title: '目标笔记', content: 'AI 内容', type: 'markdown' },
      }),
    ).rejects.toMatchObject({ code: 'NOTE_VERSION_CONFLICT', status: 409 });

    expect(connection.query.mock.calls.some(([sql]) => sql === 'INSERT INTO note_versions SET ?')).toBe(false);
    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE note SET content'))).toBe(false);
  });
});

describe('noteService 笔记提及引用同步接入(N0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.beginTransaction.mockResolvedValue();
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
    extractOwnedResourceRefs.mockReturnValue([]);
    syncNoteResourceRefs.mockResolvedValue({ inserted: 0, updated: 0, deleted: 0 });
  });

  it('createNote 正文含站内链接 → 事务内、commit 前调用 sync', async () => {
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    const content = '<a href="/noteLibrary/n1">x</a>';
    const result = await createNote({ userId: 'u1', note: { title: 'T', content, type: 'html' } });
    expect(extractOwnedResourceRefs).toHaveBeenCalledWith({ content, type: 'html' });
    expect(syncNoteResourceRefs).toHaveBeenCalledWith(connection, {
      userId: 'u1',
      noteId: result.id,
      refs: [{ type: 'note', id: 'n1' }],
    });
    const syncOrder = syncNoteResourceRefs.mock.invocationCallOrder[0];
    const commitOrder = connection.commit.mock.invocationCallOrder[0];
    expect(syncOrder).toBeLessThan(commitOrder);
  });

  it('createNote 正文无站内链接 → 跳过 sync(新建无旧集合)', async () => {
    extractOwnedResourceRefs.mockReturnValue([]);
    await createNote({ userId: 'u1', note: { title: 'T', content: '纯文本无链接', type: 'html' } });
    expect(syncNoteResourceRefs).not.toHaveBeenCalled();
  });

  it('createNote 的引用同步失败 → 整个创建事务回滚且不提交', async () => {
    const syncError = new Error('reference sync failed');
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    syncNoteResourceRefs.mockRejectedValueOnce(syncError);

    await expect(
      createNote({ userId: 'u1', note: { title: '同步失败', content: '<a href="/noteLibrary/n1">x</a>', type: 'html' } }),
    ).rejects.toBe(syncError);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('applyOwnedNoteContentChange UPDATE 后无条件 sync(正文清空链接→删旧引用)', async () => {
    extractOwnedResourceRefs.mockReturnValue([]);
    connection.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT title, content, type FROM note')) {
        return [[{ title: 'T', content: '<a href="/noteLibrary/n1">x</a>', type: 'html' }]];
      }
      if (sql.startsWith('SELECT id FROM note_versions')) return [[]];
      return [{ affectedRows: 1 }];
    });
    await applyOwnedNoteContentChange(connection, {
      userId: 'u1',
      noteId: 'note-1',
      before: { title: 'T', content: '<a href="/noteLibrary/n1">x</a>', type: 'html' },
      after: { title: 'T', content: '清空了链接', type: 'html' },
    });
    expect(extractOwnedResourceRefs).toHaveBeenCalledWith({ content: '清空了链接', type: 'html' });
    expect(syncNoteResourceRefs).toHaveBeenCalledWith(connection, { userId: 'u1', noteId: 'note-1', refs: [] });
  });

  it('applyOwnedNoteContentChange 的同步失败向所属事务抛出，不伪造成功', async () => {
    const syncError = new Error('reference sync failed');
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    syncNoteResourceRefs.mockRejectedValueOnce(syncError);
    connection.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT title, content, type FROM note')) {
        return [[{ title: 'T', content: '旧正文', type: 'html' }]];
      }
      if (sql.startsWith('SELECT id FROM note_versions')) return [[]];
      return [{ affectedRows: 1 }];
    });

    await expect(
      applyOwnedNoteContentChange(connection, {
        userId: 'u1',
        noteId: 'note-1',
        before: { title: 'T', content: '旧正文', type: 'html' },
        after: { title: 'T', content: '<a href="/noteLibrary/n1">新正文</a>', type: 'html' },
      }),
    ).rejects.toBe(syncError);
  });
});

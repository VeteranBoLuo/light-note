import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildNoteFormatConversionAnalysisHash } from '../util/noteFormatConversion.js';

// 笔记内联提及(N0)handler 接入测试:验证 updateNote / restoreNoteVersion 在 commit 前正确同步引用,
// 尤其 updateNote「仅改标题/标签(不带 content)时绝不解析、绝不 sync」——否则会用空正文误删用户已有引用。
// 引用同步钩子被 mock(其逻辑由 noteReferenceService.test.js 覆盖)。
const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(async () => connection);
const poolQuery = vi.fn();
const ensureNotVisitor = vi.fn(() => true);
const replaceResourceTagRelations = vi.fn();
const validateUserTags = vi.fn(async () => []);
const extractOwnedResourceRefs = vi.fn(() => []);
const syncNoteResourceRefs = vi.fn(async () => ({ inserted: 0, deleted: 0 }));
const deleteNoteResourceRefsForNotes = vi.fn();
const normalizeResourceRef = vi.fn((value) => {
  if (!value || !['note', 'bookmark', 'file'].includes(value.type) || !value.id) return null;
  return { type: value.type, id: String(value.id) };
});
const normalizeResourceRefList = vi.fn((values) => ({
  refs: Array.isArray(values) ? values : [],
  invalid: !Array.isArray(values),
  tooMany: false,
}));
const resolveOwnedResourceRefSummaries = vi.fn(async () => []);
const getResourceRefNavigation = vi.fn((ref) => ({ target: `${ref.type}-target` }));
const listOwnedResourceBacklinks = vi.fn(async () => ({ available: true, items: [], hasMore: false }));

vi.mock('../db/index.js', () => ({ default: { getConnection, query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  L: (_req, zh) => zh,
  snakeCaseKeys: vi.fn((obj) => obj),
  mergeExistingProperties: vi.fn((obj) => obj),
  insertData: vi.fn((obj) => ({ ...obj, id: 'gen-id' })),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/resourceTags.js', () => ({
  RESOURCE_TYPE: { NOTE: 'note' },
  replaceResourceTagRelations,
  validateUserTags,
}));
vi.mock('../util/resourceInbox.js', () => ({ attachPendingStatus: vi.fn(), removeInboxRelations: vi.fn() }));
vi.mock('../util/services/noteService.js', () => ({ createNote: vi.fn() }));
vi.mock('../util/services/tagService.js', () => ({ createTag: vi.fn() }));
vi.mock('../util/noteImages.js', () => ({
  cleanupOrphanNoteImages: vi.fn(),
  extractNoteImageUrls: vi.fn(() => []),
  filterOwnedImageUrls: vi.fn(async () => []),
}));
vi.mock('../util/personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: vi.fn(() => 'TEST_CODE') }));
vi.mock('../util/services/noteReferenceService.js', () => ({
  DEFAULT_RESOURCE_BACKLINK_LIMIT: 5,
  MAX_RESOURCE_BACKLINK_LIMIT: 50,
  extractOwnedResourceRefs,
  syncNoteResourceRefs,
  deleteNoteResourceRefsForNotes,
  normalizeResourceRef,
  normalizeResourceRefList,
  resolveOwnedResourceRefSummaries,
  getResourceRefNavigation,
  listOwnedResourceBacklinks,
}));

const { updateNote, convertNoteMode, restoreNoteVersion, delNote, resolveResourceRefs, resourceBacklinks } =
  await import('./noteLibraryHandle.js');

const mockRes = () => ({ send: vi.fn() });
const lastSent = (res) => res.send.mock.calls.at(-1)?.[0];

describe('updateNote 引用同步接入(N0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
    extractOwnedResourceRefs.mockReturnValue([]);
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [[{ id: 'note-1', title: '旧标题', content: '旧正文', type: 'html', revision: 1 }]];
      }
      if (/SELECT create_time FROM note_versions/.test(sql)) return [[]];
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
    syncNoteResourceRefs.mockResolvedValue({ inserted: 0, updated: 0, deleted: 0 });
  });

  it('提交了正文(含站内链接) → commit 前同步引用', async () => {
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [[{ id: 'note-1', title: 'o', content: 'o', type: 'html', revision: 1 }]];
      }
      if (/SELECT create_time FROM note_versions/.test(sql)) return [[]];
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();
    await updateNote(
      { user: { id: 'u1' }, body: { id: 'note-1', content: '<a href="/noteLibrary/n1">x</a>', type: 'html' } },
      res,
    );
    expect(extractOwnedResourceRefs).toHaveBeenCalledWith({ content: '<a href="/noteLibrary/n1">x</a>', type: 'html' });
    expect(syncNoteResourceRefs).toHaveBeenCalledWith(connection, {
      userId: 'u1',
      noteId: 'note-1',
      refs: [{ type: 'note', id: 'n1' }],
    });
    const syncOrder = syncNoteResourceRefs.mock.invocationCallOrder[0];
    const commitOrder = connection.commit.mock.invocationCallOrder[0];
    expect(syncOrder).toBeLessThan(commitOrder);
    expect(lastSent(res).status).toBe(200);
  });

  it('仅改标题(不带 content/type) → 不解析、不同步(防止误删已有引用)', async () => {
    const res = mockRes();
    await updateNote({ user: { id: 'u1' }, body: { id: 'note-1', title: '只改标题' } }, res);
    expect(extractOwnedResourceRefs).not.toHaveBeenCalled();
    expect(syncNoteResourceRefs).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('提交空正文 → 仍同步(空集合删除旧引用)', async () => {
    extractOwnedResourceRefs.mockReturnValue([]);
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [[{ id: 'note-1', title: 'o', content: 'o', type: 'html', revision: 1 }]];
      }
      if (/SELECT create_time FROM note_versions/.test(sql)) return [[]];
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();
    await updateNote({ user: { id: 'u1' }, body: { id: 'note-1', content: '', type: 'html' } }, res);
    expect(syncNoteResourceRefs).toHaveBeenCalledWith(connection, { userId: 'u1', noteId: 'note-1', refs: [] });
  });

  it('旧页面提交 Markdown 的 &gt; → 写库前恢复为真实引用标记', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [[{ id: 'note-1', title: '日报', content: '> 原始引用', type: 'markdown', revision: 1 }]];
      }
      if (/SELECT create_time FROM note_versions/.test(sql)) return [[]];
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });

    await updateNote(
      { user: { id: 'u1' }, body: { id: 'note-1', content: '&gt; 2026-07-24 星期五', type: 'markdown' } },
      mockRes(),
    );

    const updateCall = connection.query.mock.calls.find(
      ([sql]) => sql === 'update note set ? where id=? and create_by=? and del_flag=0',
    );
    expect(updateCall?.[1]?.[0]).toMatchObject({ content: '> 2026-07-24 星期五', revision: 2 });
    expect(updateCall?.[1]?.[0]).not.toHaveProperty('type');
  });

  it('只带 content 不带 type → 用最终笔记的 type 解析(P1-4,不凭空按 html)', async () => {
    extractOwnedResourceRefs.mockReturnValue([]);
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [[{ id: 'note-1', title: 'o', content: 'o', type: 'markdown', revision: 1 }]];
      }
      if (/SELECT create_time FROM note_versions/.test(sql)) return [[]];
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();
    await updateNote({ user: { id: 'u1' }, body: { id: 'note-1', content: '[x](/noteLibrary/n1)' } }, res);
    expect(extractOwnedResourceRefs).toHaveBeenCalledWith({ content: '[x](/noteLibrary/n1)', type: 'markdown' });
  });

  it('只切换 type 不带 content → 用最终正文与类型重算引用', async () => {
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [[{ id: 'note-1', title: 'o', content: '[x](/noteLibrary/n1)', type: 'html', revision: 1 }]];
      }
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });

    await updateNote({ user: { id: 'u1' }, body: { id: 'note-1', type: 'markdown' } }, mockRes());

    expect(extractOwnedResourceRefs).toHaveBeenCalledWith({ content: '[x](/noteLibrary/n1)', type: 'markdown' });
    expect(syncNoteResourceRefs).toHaveBeenCalledWith(connection, {
      userId: 'u1',
      noteId: 'note-1',
      refs: [{ type: 'note', id: 'n1' }],
    });
  });

  it('引用同步失败 → 页面正文更新事务回滚且不提交', async () => {
    const syncError = new Error('reference sync failed');
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    syncNoteResourceRefs.mockRejectedValueOnce(syncError);
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [[{ id: 'note-1', title: 'o', content: 'o', type: 'html', revision: 1 }]];
      }
      if (/SELECT create_time FROM note_versions/.test(sql)) return [[]];
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });

    await updateNote(
      { user: { id: 'u1' }, body: { id: 'note-1', content: '<a href="/noteLibrary/n1">x</a>', type: 'html' } },
      mockRes(),
    );

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('主表更新严格过滤页面树、归属、删除和排序字段', async () => {
    const res = mockRes();

    await updateNote(
      {
        user: { id: 'u1' },
        body: {
          id: 'note-1',
          title: '安全标题',
          parentId: 'other-parent',
          parent_id: 'other-parent',
          createBy: 'other-user',
          create_by: 'other-user',
          updateBy: 'other-user',
          delFlag: 1,
          treeDeleteBatchId: 'batch-1',
          sort: -999,
          isTop: 1,
        },
      },
      res,
    );

    const updateCall = connection.query.mock.calls.find(
      ([sql]) => sql === 'update note set ? where id=? and create_by=? and del_flag=0',
    );
    expect(updateCall?.[1]).toEqual([{ title: '安全标题', updateBy: 'u1', revision: 2 }, 'note-1', 'u1']);
    expect(lastSent(res).status).toBe(200);
  });

  it('提交旧 revision → 返回当前安全快照且不执行任何覆盖写入', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [
          [
            {
              id: 'note-1',
              title: '云端标题',
              content: '<p>云端正文</p><script>alert(1)</script>',
              type: 'html',
              revision: 4,
              update_time: '2026-08-07 12:00:00',
            },
          ],
        ];
      }
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();

    await updateNote(
      {
        user: { id: 'u1' },
        body: { id: 'note-1', revision: 3, content: '<p>本地正文</p>', type: 'html' },
      },
      res,
    );

    expect(lastSent(res)).toMatchObject({
      status: 409,
      data: {
        code: 'NOTE_VERSION_CONFLICT',
        details: {
          current: {
            id: 'note-1',
            title: '云端标题',
            content: '<p>云端正文</p>',
            type: 'html',
            revision: 4,
          },
        },
      },
    });
    expect(connection.query.mock.calls.some(([sql]) => /^\s*(?:update|insert|delete)\b/i.test(String(sql)))).toBe(
      false,
    );
    expect(syncNoteResourceRefs).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('非本人或已删除笔记在任何关系写入前返回 404', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    const res = mockRes();

    await updateNote(
      { user: { id: 'u1' }, body: { id: 'other-note', content: '不能写入', type: 'markdown', tags: ['tag-1'] } },
      res,
    );

    expect(lastSent(res)).toMatchObject({ status: 404, data: { code: 'NOTE_TREE_NODE_NOT_FOUND' } });
    expect(validateUserTags).not.toHaveBeenCalled();
    expect(replaceResourceTagRelations).not.toHaveBeenCalled();
    expect(syncNoteResourceRefs).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('非法类型和空标题在获取数据库连接前拒绝', async () => {
    const invalidTypeRes = mockRes();
    await updateNote({ user: { id: 'u1' }, body: { id: 'note-1', type: 'plaintext' } }, invalidTypeRes);
    const blankTitleRes = mockRes();
    await updateNote({ user: { id: 'u1' }, body: { id: 'note-1', title: '   ' } }, blankTitleRes);

    expect(lastSent(invalidTypeRes).status).toBe(400);
    expect(lastSent(blankTitleRes).status).toBe(400);
    expect(getConnection).not.toHaveBeenCalled();
  });
});

describe('convertNoteMode 原子格式转换', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    syncNoteResourceRefs.mockResolvedValue({ inserted: 1, updated: 0, deleted: 0 });
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
  });

  it('锁定 revision、强制保存还原点、更新格式并在 commit 前同步引用', async () => {
    const convertedContent = '# 新标题\n\n[引用](/noteLibrary/n1)';
    const analysisHash = buildNoteFormatConversionAnalysisHash({
      targetType: 'markdown',
      convertedContent,
      baseRevision: 3,
    });
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, title, content, type, revision, update_time FROM note/.test(sql)) {
        return [
          [
            {
              id: 'note-1',
              title: '标题',
              content: '<h1>旧标题</h1>',
              type: 'html',
              revision: 3,
              update_time: '2026-08-08 01:00:00',
            },
          ],
        ];
      }
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      if (/SELECT update_time FROM note/.test(sql)) return [[{ update_time: '2026-08-08 01:05:00' }]];
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();

    await convertNoteMode(
      {
        user: { id: 'u1' },
        body: { id: 'note-1', targetType: 'markdown', convertedContent, baseRevision: 3, analysisHash },
      },
      res,
    );

    const historyInsert = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO note_versions SET ?');
    expect(historyInsert?.[1]?.[0]).toMatchObject({
      title: '标题',
      content: '<h1>旧标题</h1>',
      type: 'html',
      sourceRevision: 3,
      reason: 'format_conversion',
    });
    expect(connection.query).toHaveBeenCalledWith(
      'UPDATE note SET content=?, type=?, update_by=?, revision=? WHERE id=? AND create_by=? AND del_flag=0',
      [convertedContent, 'markdown', 'u1', 4, 'note-1', 'u1'],
    );
    expect(extractOwnedResourceRefs).toHaveBeenCalledWith({ content: convertedContent, type: 'markdown' });
    expect(syncNoteResourceRefs).toHaveBeenCalledWith(connection, {
      userId: 'u1',
      noteId: 'note-1',
      refs: [{ type: 'note', id: 'n1' }],
    });
    expect(syncNoteResourceRefs.mock.invocationCallOrder[0]).toBeLessThan(
      connection.commit.mock.invocationCallOrder[0],
    );
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: { id: 'note-1', content: convertedContent, type: 'markdown', revision: 4 },
    });
  });

  it('baseRevision 过期时返回当前安全版本，不创建快照也不覆盖', async () => {
    const convertedContent = '# 本地版本';
    const analysisHash = buildNoteFormatConversionAnalysisHash({
      targetType: 'markdown',
      convertedContent,
      baseRevision: 3,
    });
    connection.query.mockResolvedValueOnce([
      [
        {
          id: 'note-1',
          title: '云端',
          content: '<p>云端</p><script>alert(1)</script>',
          type: 'html',
          revision: 4,
        },
      ],
    ]);
    const res = mockRes();

    await convertNoteMode(
      {
        user: { id: 'u1' },
        body: { id: 'note-1', targetType: 'markdown', convertedContent, baseRevision: 3, analysisHash },
      },
      res,
    );

    expect(lastSent(res)).toMatchObject({
      status: 409,
      data: {
        code: 'NOTE_VERSION_CONFLICT',
        details: { current: { content: '<p>云端</p>', revision: 4 } },
      },
    });
    expect(connection.query.mock.calls.some(([sql]) => /^\s*(?:UPDATE|INSERT|DELETE)\b/u.test(String(sql)))).toBe(
      false,
    );
    expect(syncNoteResourceRefs).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('预览正文和指纹不一致时拒绝转换', async () => {
    const analysisHash = buildNoteFormatConversionAnalysisHash({
      targetType: 'markdown',
      convertedContent: '# 预览内容',
      baseRevision: 3,
    });
    connection.query.mockResolvedValueOnce([
      [{ id: 'note-1', title: '标题', content: '<p>旧正文</p>', type: 'html', revision: 3 }],
    ]);
    const res = mockRes();

    await convertNoteMode(
      {
        user: { id: 'u1' },
        body: {
          id: 'note-1',
          targetType: 'markdown',
          convertedContent: '# 被篡改内容',
          baseRevision: 3,
          analysisHash,
        },
      },
      res,
    );

    expect(lastSent(res)).toMatchObject({ status: 409, data: { code: 'NOTE_CONVERSION_STALE' } });
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});

describe('restoreNoteVersion 引用同步接入(N0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
    extractOwnedResourceRefs.mockReturnValue([]);
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
    syncNoteResourceRefs.mockResolvedValue({ inserted: 0, updated: 0, deleted: 0 });
  });

  it('恢复版本用目标正文重算引用并在 commit 前同步', async () => {
    extractOwnedResourceRefs.mockReturnValue([{ type: 'file', id: 'f9' }]);
    connection.query.mockImplementation(async (sql) => {
      if (/FROM note_versions WHERE id=/.test(sql)) {
        return [[{ note_id: 'note-1', title: 'V', content: '<a href="/cloudSpace?fileId=f9">f</a>', type: 'html' }]];
      }
      if (/SELECT title, content, type, revision, update_time FROM note WHERE id=/.test(sql)) {
        return [[{ title: 'c', content: 'c', type: 'html', revision: 3 }]];
      }
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();
    await restoreNoteVersion({ user: { id: 'u1' }, body: { id: 'ver-1' } }, res);
    expect(extractOwnedResourceRefs).toHaveBeenCalledWith({
      content: '<a href="/cloudSpace?fileId=f9">f</a>',
      type: 'html',
    });
    expect(syncNoteResourceRefs).toHaveBeenCalledWith(connection, {
      userId: 'u1',
      noteId: 'note-1',
      refs: [{ type: 'file', id: 'f9' }],
    });
    const syncOrder = syncNoteResourceRefs.mock.invocationCallOrder[0];
    const commitOrder = connection.commit.mock.invocationCallOrder[0];
    expect(syncOrder).toBeLessThan(commitOrder);
  });

  it('引用同步失败 → 恢复版本事务回滚且不提交', async () => {
    const syncError = new Error('reference sync failed');
    extractOwnedResourceRefs.mockReturnValue([{ type: 'file', id: 'f9' }]);
    syncNoteResourceRefs.mockRejectedValueOnce(syncError);
    connection.query.mockImplementation(async (sql) => {
      if (/FROM note_versions WHERE id=/.test(sql)) {
        return [[{ note_id: 'note-1', title: 'V', content: '<a href="/cloudSpace?fileId=f9">f</a>', type: 'html' }]];
      }
      if (/SELECT title, content, type, revision, update_time FROM note WHERE id=/.test(sql)) {
        return [[{ title: 'c', content: 'c', type: 'html', revision: 3 }]];
      }
      if (/SELECT COUNT\(\*\) AS n FROM note_versions/.test(sql)) return [[{ n: 1 }]];
      return [{ affectedRows: 1 }];
    });

    await restoreNoteVersion({ user: { id: 'u1' }, body: { id: 'ver-1' } }, mockRes());

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('恢复时 revision 已变化 → 保留当前版本且不创建恢复快照', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (/FROM note_versions WHERE id=/.test(sql)) {
        return [[{ note_id: 'note-1', title: '历史标题', content: '<p>历史正文</p>', type: 'html' }]];
      }
      if (/SELECT title, content, type, revision, update_time FROM note WHERE id=/.test(sql)) {
        return [
          [
            {
              title: '云端标题',
              content: '<p>云端正文</p>',
              type: 'html',
              revision: 5,
              update_time: '2026-08-07 12:00:00',
            },
          ],
        ];
      }
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();

    await restoreNoteVersion({ user: { id: 'u1' }, body: { id: 'ver-1', revision: 4 } }, res);

    expect(lastSent(res)).toMatchObject({
      status: 409,
      data: {
        code: 'NOTE_VERSION_CONFLICT',
        details: { current: { title: '云端标题', revision: 5 } },
      },
    });
    expect(connection.query.mock.calls.some(([sql]) => /^\s*(?:update|insert|delete)\b/i.test(String(sql)))).toBe(
      false,
    );
    expect(syncNoteResourceRefs).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });
});

describe('delNote 源笔记软删除生命周期(N0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
  });

  it('软删除只标记源笔记，不删除其派生引用关系', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id, parent_id, title/.test(String(sql))) {
        return [[{ id: 'note-1', parent_id: null, title: '笔记', del_flag: 0 }]];
      }
      return [{ affectedRows: 1 }];
    });
    await delNote({ user: { id: 'u1' }, body: { ids: ['note-1'] } }, mockRes());

    expect(deleteNoteResourceRefsForNotes).not.toHaveBeenCalled();
    expect(connection.query.mock.calls.some(([sql]) => /DELETE FROM note_resource_refs/.test(String(sql)))).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});

describe('N1/N2 只读引用接口', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeResourceRef.mockImplementation((value) => {
      if (!value || !['note', 'bookmark', 'file'].includes(value.type) || !value.id) return null;
      return { type: value.type, id: String(value.id) };
    });
    normalizeResourceRefList.mockImplementation((values) => ({
      refs: Array.isArray(values) ? values : [],
      invalid: !Array.isArray(values),
      tooMany: false,
    }));
    resolveOwnedResourceRefSummaries.mockResolvedValue([]);
    getResourceRefNavigation.mockImplementation((ref) => ({ target: `${ref.type}-target` }));
    listOwnedResourceBacklinks.mockResolvedValue({ available: true, items: [], hasMore: false });
  });

  it('resolveResourceRefs 永远使用当前 subject，不采纳请求体 userId，并只给可用项导航', async () => {
    resolveOwnedResourceRefSummaries.mockResolvedValue([
      { type: 'note', id: 'n1', title: '当前标题', available: true },
      { type: 'bookmark', id: 'b1', title: '书签标题', url: 'https://example.com', available: true },
      { type: 'file', id: 'gone', title: null, available: false },
    ]);
    const res = mockRes();
    await resolveResourceRefs(
      { user: { id: 'subject-u' }, body: { userId: 'attacker-u', refs: [{ type: 'note', id: 'n1' }] } },
      res,
    );
    expect(resolveOwnedResourceRefSummaries).toHaveBeenCalledWith(expect.anything(), {
      userId: 'subject-u',
      refs: [{ type: 'note', id: 'n1' }],
    });
    expect(lastSent(res)).toEqual({
      data: {
        refs: [
          { type: 'note', id: 'n1', title: '当前标题', available: true, navigation: { target: 'note-target' } },
          {
            type: 'bookmark',
            id: 'b1',
            title: '书签标题',
            available: true,
            url: 'https://example.com',
            navigation: { target: 'bookmark-target' },
          },
          { type: 'file', id: 'gone', title: null, available: false, navigation: null },
        ],
      },
      status: 200,
      msg: '',
    });
  });

  it('resolveResourceRefs 对无效 / 超限请求在查库前拒绝', async () => {
    normalizeResourceRefList.mockReturnValueOnce({ refs: [], invalid: true, tooMany: false });
    const invalidRes = mockRes();
    await resolveResourceRefs({ user: { id: 'u1' }, body: { refs: 'not-array' } }, invalidRes);
    expect(lastSent(invalidRes).status).toBe(400);
    expect(resolveOwnedResourceRefSummaries).not.toHaveBeenCalled();

    normalizeResourceRefList.mockReturnValueOnce({ refs: [], invalid: false, tooMany: true });
    const overflowRes = mockRes();
    await resolveResourceRefs({ user: { id: 'u1' }, body: { refs: [] } }, overflowRes);
    expect(lastSent(overflowRes).status).toBe(400);
  });

  it('resourceBacklinks 重新使用当前 subject 和受限 limit，不采纳请求体 userId', async () => {
    const res = mockRes();
    await resourceBacklinks(
      {
        user: { id: 'subject-u' },
        body: { userId: 'attacker-u', targetType: 'bookmark', targetId: 'b1', limit: 5 },
      },
      res,
    );
    expect(listOwnedResourceBacklinks).toHaveBeenCalledWith(expect.anything(), {
      userId: 'subject-u',
      targetType: 'bookmark',
      targetId: 'b1',
      limit: 5,
    });
    expect(lastSent(res).status).toBe(200);
  });

  it('resourceBacklinks 不接受不安全目标或超范围 limit', async () => {
    normalizeResourceRef.mockReturnValueOnce(null);
    const targetRes = mockRes();
    await resourceBacklinks({ user: { id: 'u1' }, body: { targetType: 'note', targetId: '' } }, targetRes);
    expect(lastSent(targetRes).status).toBe(400);
    expect(listOwnedResourceBacklinks).not.toHaveBeenCalled();

    const limitRes = mockRes();
    await resourceBacklinks({ user: { id: 'u1' }, body: { targetType: 'note', targetId: 'n1', limit: 51 } }, limitRes);
    expect(lastSent(limitRes).status).toBe(400);
    expect(listOwnedResourceBacklinks).not.toHaveBeenCalled();
  });
});

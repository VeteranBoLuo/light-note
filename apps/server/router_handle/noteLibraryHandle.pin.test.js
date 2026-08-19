import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(async () => connection);
const ensureNotVisitor = vi.fn(() => true);
const attachPendingStatus = vi.fn();
const removeInboxRelations = vi.fn();
const invalidatePersonalKnowledgeCache = vi.fn();
const { buildNoteCardPreview, extractNoteCardPreviewImage, noteImageThumbnailPathname } = vi.hoisted(() => ({
  buildNoteCardPreview: vi.fn((content) => ({
    summary: String(content || '').includes('note-cover.png') ? '图片上方\n图片下方' : '纯文本摘要',
    beforeImage: String(content || '').includes('note-cover.png') ? '图片上方' : '纯文本摘要',
    afterImage: String(content || '').includes('note-cover.png') ? '图片下方' : '',
    imageUrl: String(content || '').includes('note-cover.png') ? 'https://boluo66.top/uploads/note-cover.png' : '',
    imageLocated: String(content || '').includes('note-cover.png'),
  })),
  extractNoteCardPreviewImage: vi.fn((content) =>
    String(content || '').includes('note-cover.png') ? 'https://boluo66.top/uploads/note-cover.png' : '',
  ),
  noteImageThumbnailPathname: vi.fn(
    () =>
      '/api/note/image-thumbnail/26e586d299cb38d4ba6d01f174aeba00d28a8ec2fd612a1816cad20acbed227f.webp?source=https%3A%2F%2Fboluo66.top%2Fuploads%2Fnote-cover.png',
  ),
}));

vi.mock('../db/index.js', () => ({ default: { getConnection, query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  L: (_req, zh) => zh,
  snakeCaseKeys: vi.fn((obj) => obj),
  mergeExistingProperties: vi.fn((obj) => obj),
  insertData: vi.fn((obj) => ({ ...obj, id: 'generated-id' })),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/resourceTags.js', () => ({
  RESOURCE_TYPE: { NOTE: 'note' },
  replaceResourceTagRelations: vi.fn(),
  validateUserTags: vi.fn(),
}));
vi.mock('../util/resourceInbox.js', () => ({
  attachPendingStatus,
  removeInboxRelations,
}));
vi.mock('../util/services/noteService.js', () => ({ createNote: vi.fn() }));
vi.mock('../util/services/tagService.js', () => ({ createTag: vi.fn() }));
vi.mock('../util/noteImages.js', () => ({
  cleanupOrphanNoteImages: vi.fn(),
  extractNoteImageUrls: vi.fn(() => []),
  filterOwnedImageUrls: vi.fn(),
}));
vi.mock('../util/noteCardPreview.js', () => ({ buildNoteCardPreview, extractNoteCardPreviewImage }));
vi.mock('../util/noteImageThumbnail.js', () => ({
  ensureNoteImageThumbnail: vi.fn(),
  getExistingNoteImageThumbnailPath: vi.fn(),
  noteImageThumbnailPathname,
  resolveOwnedNoteThumbnailSource: vi.fn(),
}));
vi.mock('../util/noteImageUpload.js', () => ({ validateNoteImageUpload: vi.fn() }));
vi.mock('../util/personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache }));

const {
  deleteNoteSubtree,
  delNote,
  getNoteDetail,
  getNoteVersions,
  moveNoteNode,
  moveNoteNodes,
  queryDrawingPreviews,
  queryNoteList,
  toggleNoteTop,
  updateNoteSort,
} = await import('./noteLibraryHandle.js');

function mockRes() {
  return { send: vi.fn() };
}

const lastSent = (res) => res.send.mock.calls.at(-1)?.[0];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('笔记置顶 handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
  });

  it('手绘卡片预览按当前用户批量读取并返回受限场景', async () => {
    const scene = JSON.stringify({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [{ id: 's1', kind: 'stroke', color: '#1f2937', width: 4, points: [1, 2, 3, 4] }],
    });
    poolQuery.mockResolvedValueOnce([[{ id: 'drawing-1', content: scene, revision: 3 }]]);
    const res = mockRes();

    await queryDrawingPreviews({ user: { id: 'u1' }, body: { ids: ['drawing-1'] } }, res);

    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("type = 'drawing'"), ['u1', 'drawing-1']);
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: { items: [{ id: 'drawing-1', revision: 3, preview: { v: 1 } }] },
    });
  });

  it('拒绝超出上限的手绘卡片预览请求且不访问数据库', async () => {
    const res = mockRes();
    await queryDrawingPreviews(
      { user: { id: 'u1' }, body: { ids: Array.from({ length: 13 }, (_, index) => `drawing-${index}`) } },
      res,
    );
    expect(lastSent(res).status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('笔记列表按置顶、自定义顺序和更新时间排序', async () => {
    poolQuery.mockResolvedValueOnce([[{ id: 'n1', is_top: 1, tags: null }]]);
    const res = mockRes();

    queryNoteList({ user: { id: 'u1' }, body: {} }, res);
    await vi.waitFor(() => expect(res.send).toHaveBeenCalled());

    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).not.toContain('SELECT n.*');
    expect(sql).toContain("IF(n.type = 'drawing', '', LEFT(COALESCE(n.content, ''), 4000)) AS content");
    expect(sql).toContain('ORDER BY n.is_top DESC, n.sort, n.update_time DESC');
    expect(params).toEqual(['u1']);
    expect(attachPendingStatus).toHaveBeenCalled();
    expect(lastSent(res).status).toBe(200);
  });

  it('分页列表只为正文开头的本站图片返回独立缩略图地址', async () => {
    poolQuery
      .mockResolvedValueOnce([
        [
          {
            id: 'n-cover',
            type: 'html',
            content: '<p>开场</p><img src="https://boluo66.top/uploads/note-cover.png">',
            tags: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const res = mockRes();

    await queryNoteList({ user: { id: 'u1' }, body: { page: 1, pageSize: 48 } }, res);

    expect(lastSent(res).data.items[0].previewImageUrl).toMatch(
      /^\/api\/note\/image-thumbnail\/[a-f0-9]{64}\.webp\?source=/,
    );
    expect(decodeURIComponent(lastSent(res).data.items[0].previewImageUrl.split('source=')[1])).toBe(
      'https://boluo66.top/uploads/note-cover.png',
    );
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });

  it('v2 分页列表返回服务端纯文本预览并省略正文前缀', async () => {
    poolQuery
      .mockResolvedValueOnce([
        [
          {
            id: 'n-cover',
            type: 'html',
            content: '<p>图片上方</p><img src="https://boluo66.top/uploads/note-cover.png"><p>图片下方</p>',
            tags: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const res = mockRes();

    await queryNoteList({ user: { id: 'u1' }, body: { page: 1, pageSize: 48, previewVersion: 2 } }, res);

    const item = lastSent(res).data.items[0];
    expect(item).toMatchObject({
      previewSummary: '图片上方\n图片下方',
      previewTextBeforeImage: '图片上方',
      previewTextAfterImage: '图片下方',
      previewImageLocated: true,
    });
    expect(item).not.toHaveProperty('content');
    expect(buildNoteCardPreview).toHaveBeenCalledTimes(1);
    expect(extractNoteCardPreviewImage).not.toHaveBeenCalled();
  });

  it('手绘列表不解析、不回传 scene JSON，旧版非分页响应也保持轻量', async () => {
    const scene = '{"v":1,"page":{"width":1024,"height":1448},"elements":[{"id":"s1"}]}';
    poolQuery.mockResolvedValueOnce([[{ id: 'drawing-1', type: 'drawing', content: scene, tags: null }]]);
    const legacyRes = mockRes();
    await queryNoteList({ user: { id: 'u1' }, body: {} }, legacyRes);
    expect(lastSent(legacyRes).data[0].content).toBe('');

    poolQuery
      .mockResolvedValueOnce([[{ id: 'drawing-1', type: 'drawing', content: scene, tags: null }]])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const v2Res = mockRes();
    await queryNoteList({ user: { id: 'u1' }, body: { page: 1, pageSize: 48, previewVersion: 2 } }, v2Res);
    expect(lastSent(v2Res).data.items[0]).toMatchObject({ previewSummary: '', previewImageUrl: '' });
    expect(lastSent(v2Res).data.items[0]).not.toHaveProperty('content');
    expect(buildNoteCardPreview).not.toHaveBeenCalled();
    expect(extractNoteCardPreviewImage).not.toHaveBeenCalled();
  });

  it('手绘详情只向声明 scene 协议版本的新客户端返回正文', async () => {
    vi.stubEnv('NOTE_TREE_READ_ENABLED', 'false');
    const scene = '{"v":1,"page":{"width":1024,"height":1448},"elements":[]}';
    const row = {
      id: 'drawing-1',
      type: 'drawing',
      content: scene,
      create_by: 'u1',
      del_flag: 0,
      revision: 1,
      isPending: 0,
    };
    poolQuery.mockResolvedValueOnce([[row]]);
    const legacyRes = mockRes();
    await getNoteDetail({ user: { id: 'u1' }, body: { id: 'drawing-1' } }, legacyRes);
    expect(lastSent(legacyRes).data).toMatchObject({ type: 'drawing', content: '', drawingUnsupported: true });

    poolQuery.mockResolvedValueOnce([[row]]);
    const currentRes = mockRes();
    await getNoteDetail({ user: { id: 'u1' }, body: { id: 'drawing-1', drawingSceneVersion: 1 } }, currentRes);
    expect(lastSent(currentRes).data).toMatchObject({ type: 'drawing', content: scene });
    expect(lastSent(currentRes).data).not.toHaveProperty('drawingUnsupported');
  });

  it('手绘历史列表只回元素计数，不批量回传 scene JSON', async () => {
    poolQuery.mockResolvedValueOnce([[{ id: 'drawing-1' }]]).mockResolvedValueOnce([
      [
        {
          id: 'version-1',
          title: '草图',
          type: 'drawing',
          content: '',
          element_count: 12,
        },
      ],
    ]);
    const res = mockRes();

    await getNoteVersions({ user: { id: 'u1' }, body: { id: 'drawing-1' } }, res);

    const historySql = poolQuery.mock.calls[1][0];
    expect(historySql).toContain("IF(type = 'drawing', '', content) AS content");
    expect(historySql).toContain("JSON_LENGTH(content, '$.elements')");
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: [{ id: 'version-1', type: 'drawing', content: '', element_count: 12 }],
    });
  });

  it('笔记详情一次返回正文、能力快照和面包屑', async () => {
    vi.stubEnv('NOTE_TREE_READ_ENABLED', 'true');
    poolQuery
      .mockResolvedValueOnce([
        [
          {
            id: 'note-1',
            parent_id: 'parent',
            title: '当前页面',
            type: 'html',
            content: '<p>正文</p>',
            create_by: 'u1',
            del_flag: 0,
            revision: 1,
            isPending: 1,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            breadcrumb_0_id: 'note-1',
            breadcrumb_0_title: '当前页面',
            breadcrumb_1_id: 'parent',
            breadcrumb_1_title: '父页面',
          },
        ],
      ]);
    const res = mockRes();

    await getNoteDetail({ user: { id: 'u1', role: 'user' }, body: { id: 'note-1' } }, res);

    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(poolQuery.mock.calls[0][0]).toContain('EXISTS (');
    expect(poolQuery.mock.calls[0][0]).toContain("i.resource_type = 'note'");
    expect(poolQuery.mock.calls[0][0]).toContain("i.status = 'pending'");
    expect(poolQuery.mock.calls[0][1]).toEqual(['note-1', 'u1', '0']);
    expect(poolQuery.mock.calls[1][0]).toContain('LEFT JOIN note breadcrumb_node_1');
    expect(poolQuery.mock.calls[1][0]).not.toContain('ORDER BY');
    expect(poolQuery.mock.calls[1][1]).toEqual(['note-1', 'u1']);
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: {
        id: 'note-1',
        content: '<p>正文</p>',
        isPending: true,
        breadcrumb: [
          { id: 'parent', title: '父页面' },
          { id: 'note-1', title: '当前页面' },
        ],
        noteTreeFeatures: { note_tree_read: true },
      },
    });
  });

  it('目录能力关闭时详情仍立即返回正文且不加载目录快照', async () => {
    vi.stubEnv('NOTE_TREE_READ_ENABLED', 'false');
    poolQuery.mockResolvedValueOnce([
      [
        {
          id: 'note-1',
          parent_id: null,
          title: '当前页面',
          type: 'html',
          content: '<p>正文</p>',
          create_by: 'u1',
          del_flag: 0,
          revision: 1,
          isPending: 0,
        },
      ],
    ]);
    const res = mockRes();

    await getNoteDetail({ user: { id: 'u1', role: 'user' }, body: { id: 'note-1' } }, res);

    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: {
        id: 'note-1',
        isPending: false,
        breadcrumb: [],
        noteTreeFeatures: { note_tree_read: false },
      },
    });
  });

  it('笔记库分页在数据库内应用搜索和无标签筛选，并返回当前条件总数', async () => {
    poolQuery
      .mockResolvedValueOnce([[{ id: 'n49', title: '项目复盘', tags: null }]])
      .mockResolvedValueOnce([[{ total: 49 }]]);
    const res = mockRes();

    await queryNoteList(
      {
        user: { id: 'u1' },
        body: { page: 2, pageSize: 48, keyword: '项目', tagId: 'null' },
      },
      res,
    );

    const [listSql, listParams] = poolQuery.mock.calls[0];
    expect(listSql).toContain("(n.title LIKE ? OR (COALESCE(n.type, 'html') <> 'drawing' AND n.content LIKE ?))");
    expect(listSql).toContain('NOT EXISTS');
    expect(listSql).toContain('LIMIT ? OFFSET ?');
    expect(listParams.slice(-2)).toEqual([48, 48]);
    expect(poolQuery.mock.calls[1][0]).toContain('COUNT(*) AS total');
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: {
        total: 49,
        page: 2,
        pageSize: 48,
        hasMore: false,
      },
    });
  });

  it('页面树模式在根笔记库查询全部层级并附加父级路径', async () => {
    poolQuery
      .mockResolvedValueOnce([
        [
          { id: 'root', parent_id: null, title: '根页面', sort: 0, is_top: 0, del_flag: 0 },
          { id: 'child', parent_id: 'root', title: '子页面', sort: 0, is_top: 0, del_flag: 0 },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { id: 'root', parent_id: null, title: '根页面', tags: null },
          { id: 'child', parent_id: 'root', title: '子页面', tags: null },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 2 }]]);
    const res = mockRes();

    await queryNoteList({ user: { id: 'u1' }, body: { page: 1, pageSize: 48, parentId: null } }, res);

    expect(poolQuery.mock.calls[0][0]).toContain('SELECT id, parent_id, title');
    expect(poolQuery.mock.calls[1][0]).not.toContain('n.parent_id IS NULL');
    expect(poolQuery.mock.calls[1][0]).toContain('ORDER BY n.is_top DESC, n.update_time DESC');
    expect(poolQuery.mock.calls[1][1]).toEqual(['u1', 48, 0]);
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: {
        total: 2,
        items: [
          { id: 'root', path_text: '' },
          { id: 'child', path_text: '根页面' },
        ],
      },
    });
  });

  it('进入具体目录后仍只查询直属子页面', async () => {
    poolQuery
      .mockResolvedValueOnce([
        [
          { id: 'parent', parent_id: null, title: '父页面', sort: 0, is_top: 0, del_flag: 0 },
          { id: 'child', parent_id: 'parent', title: '子页面', sort: 0, is_top: 0, del_flag: 0 },
        ],
      ])
      .mockResolvedValueOnce([[{ id: 'child', parent_id: 'parent', title: '子页面', tags: null }]])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const res = mockRes();

    await queryNoteList({ user: { id: 'u1' }, body: { page: 1, pageSize: 48, parentId: 'parent' } }, res);

    expect(poolQuery.mock.calls[1][0]).toContain('n.parent_id = ?');
    expect(poolQuery.mock.calls[1][1]).toEqual(['u1', 'parent', 48, 0]);
    expect(lastSent(res)).toMatchObject({ status: 200, data: { total: 1 } });
  });

  it('页面树内搜索由服务端扩展权威后代，并为重名结果附加路径', async () => {
    poolQuery
      .mockResolvedValueOnce([
        [
          { id: 'parent', parent_id: null, title: '项目', sort: 0, is_top: 0, del_flag: 0 },
          { id: 'child', parent_id: 'parent', title: '模块', sort: 0, is_top: 0, del_flag: 0 },
          { id: 'grandchild', parent_id: 'child', title: '复盘', sort: 0, is_top: 0, del_flag: 0 },
        ],
      ])
      .mockResolvedValueOnce([[{ id: 'grandchild', parent_id: 'child', title: '复盘', tags: null }]])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const res = mockRes();

    await queryNoteList(
      { user: { id: 'u1' }, body: { page: 1, pageSize: 48, parentId: 'parent', keyword: '复盘' } },
      res,
    );

    const [listSql, listParams] = poolQuery.mock.calls[1];
    expect(listSql).toContain('n.id IN (?,?)');
    expect(listParams).toEqual(['u1', 'child', 'grandchild', '%复盘%', '%复盘%', 48, 0]);
    expect(lastSent(res).data.items[0]).toMatchObject({
      id: 'grandchild',
      path: [
        { id: 'parent', title: '项目' },
        { id: 'child', title: '模块' },
        { id: 'grandchild', title: '复盘' },
      ],
      path_text: '项目 / 模块',
    });
  });

  it('具体目录与标签可组合筛选，并由服务端限定到该目录的全部后代', async () => {
    poolQuery
      .mockResolvedValueOnce([
        [
          { id: 'parent', parent_id: null, title: '项目', sort: 0, is_top: 0, del_flag: 0 },
          { id: 'child', parent_id: 'parent', title: '模块', sort: 0, is_top: 0, del_flag: 0 },
          { id: 'grandchild', parent_id: 'child', title: '复盘', sort: 0, is_top: 0, del_flag: 0 },
        ],
      ])
      .mockResolvedValueOnce([[{ id: 'grandchild', parent_id: 'child', title: '复盘', tags: null }]])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const res = mockRes();

    await queryNoteList(
      { user: { id: 'u1' }, body: { page: 1, pageSize: 48, parentId: 'parent', tagId: 'tag-project' } },
      res,
    );

    const [listSql, listParams] = poolQuery.mock.calls[1];
    expect(listSql).toContain('n.id IN (?,?)');
    expect(listSql).toContain("nr.resource_type = 'note'");
    expect(listSql).toContain('nr.tag_id = ?');
    expect(listParams).toEqual(['u1', 'child', 'grandchild', 'tag-project', 48, 0]);
    expect(lastSent(res)).toMatchObject({ status: 200, data: { total: 1 } });
  });

  it('页面树模式拒绝不属于当前用户的 parentId', async () => {
    poolQuery.mockResolvedValueOnce([[]]);
    const res = mockRes();

    await queryNoteList({ user: { id: 'u1' }, body: { parentId: 'other-user-note' } }, res);

    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(lastSent(res)).toMatchObject({
      status: 404,
      data: { code: 'NOTE_TREE_PARENT_NOT_FOUND' },
    });
  });

  it('游客请求被拒绝且不获取数据库连接', async () => {
    ensureNotVisitor.mockImplementation((req, res) => {
      res.send({ data: null, status: 403, msg: '游客无权限' });
      return false;
    });
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'visitor' }, body: { id: 'n1' } }, res);

    expect(getConnection).not.toHaveBeenCalled();
    expect(lastSent(res).status).toBe(403);
  });

  it('缺少笔记 id 返回 400', async () => {
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: {} }, res);

    expect(getConnection).not.toHaveBeenCalled();
    expect(lastSent(res).status).toBe(400);
  });

  it('非本人或已删除笔记返回 404', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: { id: 'other-note' } }, res);

    expect(connection.query.mock.calls[0][0]).toContain('create_by = ? AND del_flag = 0 FOR UPDATE');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(lastSent(res).status).toBe(404);
  });

  it('成功置顶并保持笔记更新时间不变', async () => {
    connection.query.mockResolvedValueOnce([[{ is_top: 0 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: { id: 'n1' } }, res);

    const [updateSql, updateParams] = connection.query.mock.calls[1];
    expect(updateSql).toContain('is_top = ?');
    expect(updateSql).toContain('update_time = update_time');
    expect(updateParams).toEqual([1, 'n1', 'u1']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(lastSent(res)).toEqual({ data: { id: 'n1', isTop: 1 }, status: 200, msg: '' });
  });

  it('数据库失败时回滚且不泄漏底层错误', async () => {
    connection.query.mockRejectedValueOnce(new Error('SQL_SECRET'));
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: { id: 'n1' } }, res);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(lastSent(res).status).toBe(500);
    expect(lastSent(res).msg).not.toContain('SQL_SECRET');
  });

  it('获取数据库连接失败时返回收口后的 500', async () => {
    getConnection.mockRejectedValueOnce(new Error('CONNECT_SECRET'));
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: { id: 'n1' } }, res);

    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).not.toHaveBeenCalled();
    expect(lastSent(res).status).toBe(500);
    expect(lastSent(res).msg).not.toContain('CONNECT_SECRET');
  });
});

describe('页面树写入 handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
    getConnection.mockResolvedValue(connection);
    connection.beginTransaction.mockResolvedValue();
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    removeInboxRelations.mockResolvedValue({ changed: 1 });
    invalidatePersonalKnowledgeCache.mockResolvedValue();
  });

  it('写灰度未命中时在获取事务连接前失败关闭', async () => {
    vi.stubEnv('NOTE_TREE_WRITE_ENABLED', 'false');
    const res = mockRes();

    await moveNoteNode({ user: { id: 'u1', role: 'user' }, body: { id: 'moved', parentId: 'target' } }, res);

    expect(getConnection).not.toHaveBeenCalled();
    expect(lastSent(res)).toMatchObject({
      status: 404,
      data: { code: 'NOTE_TREE_FEATURE_DISABLED', feature: 'note_tree_write' },
    });
  });

  it('子树回收站拥有独立急停开关', async () => {
    vi.stubEnv('NOTE_TREE_SUBTREE_TRASH_ENABLED', 'false');
    const res = mockRes();

    await deleteNoteSubtree(
      { user: { id: 'u1', role: 'user' }, body: { id: 'parent', expectedDescendantCount: 1 } },
      res,
    );

    expect(getConnection).not.toHaveBeenCalled();
    expect(lastSent(res)).toMatchObject({
      status: 404,
      data: { code: 'NOTE_TREE_FEATURE_DISABLED', feature: 'note_tree_subtree_trash' },
    });
  });

  it('跨目录移动在事务中锁定 owner 树，提交后才刷新知识缓存', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT id, parent_id')) {
        return [
          [
            { id: 'moved', parent_id: null, title: '待移动', sort: 0, is_top: 0, del_flag: 0 },
            { id: 'target', parent_id: null, title: '目标', sort: 1, is_top: 0, del_flag: 0 },
          ],
        ];
      }
      if (String(sql).includes('FROM note_shares s')) return [[]];
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();

    await moveNoteNode({ user: { id: 'u1' }, body: { id: 'moved', parentId: 'target' } }, res);

    expect(connection.query.mock.calls[0]).toEqual([expect.stringContaining('FOR UPDATE'), ['u1']]);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('SET parent_id = ?'))).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(invalidatePersonalKnowledgeCache).toHaveBeenCalledWith('u1');
    expect(lastSent(res)).toMatchObject({ status: 200, data: { id: 'moved', parentId: 'target', moved: true } });
  });

  it('移动到自己的后代返回稳定 409，并回滚事务', async () => {
    connection.query.mockResolvedValueOnce([
      [
        { id: 'parent', parent_id: null, title: '父页面', sort: 0, is_top: 0, del_flag: 0 },
        { id: 'child', parent_id: 'parent', title: '子页面', sort: 0, is_top: 0, del_flag: 0 },
      ],
    ]);
    const res = mockRes();

    await moveNoteNode({ user: { id: 'u1' }, body: { id: 'parent', parentId: 'child' } }, res);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(lastSent(res)).toMatchObject({ status: 409, data: { code: 'NOTE_TREE_CYCLE' } });
  });

  it('批量移动在同一事务中折叠父子选择并提交后刷新知识缓存', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT id, parent_id')) {
        return [
          [
            { id: 'target', parent_id: null, title: '目标', sort: 0, is_top: 0, del_flag: 0 },
            { id: 'parent', parent_id: null, title: '父页面', sort: 1, is_top: 0, del_flag: 0 },
            { id: 'child', parent_id: 'parent', title: '子页面', sort: 0, is_top: 0, del_flag: 0 },
          ],
        ];
      }
      if (String(sql).includes('FROM note_shares s')) return [[]];
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();

    await moveNoteNodes({ user: { id: 'u1' }, body: { ids: ['parent', 'child'], parentId: 'target' } }, res);

    expect(connection.query.mock.calls[0]).toEqual([expect.stringContaining('FOR UPDATE'), ['u1']]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(invalidatePersonalKnowledgeCache).toHaveBeenCalledWith('u1');
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: { requestedCount: 2, rootCount: 1, movedCount: 1, affectedCount: 2, parentId: 'target' },
    });
  });

  it('旧删除接口发现任一直接子页面时拒绝，避免制造孤儿', async () => {
    connection.query.mockResolvedValueOnce([
      [
        { id: 'parent', parent_id: null, title: '父页面', del_flag: 0 },
        { id: 'child', parent_id: 'parent', title: '子页面', del_flag: 0 },
      ],
    ]);
    const res = mockRes();

    await delNote({ user: { id: 'u1' }, body: { ids: ['parent'] } }, res);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(removeInboxRelations).not.toHaveBeenCalled();
    expect(lastSent(res)).toMatchObject({ status: 409, data: { code: 'NOTE_HAS_CHILDREN' } });
  });

  it('新删除接口按确认数量原子删除整棵子树，并在提交后失效知识缓存', async () => {
    connection.query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (statement.includes('SELECT id, parent_id')) {
        return [
          [
            { id: 'parent', parent_id: null, title: '父页面', del_flag: 0 },
            { id: 'child', parent_id: 'parent', title: '子页面', del_flag: 0 },
          ],
        ];
      }
      if (statement.includes('SET del_flag = 1')) return [{ affectedRows: 2 }];
      return [{ affectedRows: 1 }];
    });
    const res = mockRes();

    await deleteNoteSubtree({ user: { id: 'u1' }, body: { id: 'parent', expectedDescendantCount: 1 } }, res);

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(invalidatePersonalKnowledgeCache).toHaveBeenCalledWith('u1');
    expect(lastSent(res)).toMatchObject({
      status: 200,
      data: { rootCount: 1, deletedCount: 2, items: [{ id: 'parent', descendantCount: 1, totalCount: 2 }] },
    });
  });

  it('旧批量排序也必须锁定并限定在同一 parent_id', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          { id: 'a', parent_id: 'parent' },
          { id: 'b', parent_id: 'parent' },
        ],
      ])
      .mockResolvedValue([{ affectedRows: 1 }]);
    const res = mockRes();

    await updateNoteSort(
      {
        user: { id: 'u1' },
        body: {
          parentId: 'parent',
          notes: [
            { id: 'a', sort: 1 },
            { id: 'b', sort: 0 },
          ],
        },
      },
      res,
    );

    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls.slice(1).every(([sql]) => String(sql).includes('parent_id <=> ?'))).toBe(true);
    expect(connection.query.mock.calls.slice(1).map(([, params]) => params.at(-1))).toEqual(['parent', 'parent']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(lastSent(res).status).toBe(200);
  });
});

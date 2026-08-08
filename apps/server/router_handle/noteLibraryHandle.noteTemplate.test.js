import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const getConnection = vi.fn();
const ensureNotVisitor = vi.fn(() => true);

vi.mock('../db/index.js', () => ({ default: { getConnection, query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  snakeCaseKeys: vi.fn((obj) => obj),
  mergeExistingProperties: vi.fn((obj) => obj),
  insertData: vi.fn((obj) => ({ ...obj, id: 'tpl-new-id' })),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/resourceTags.js', () => ({
  RESOURCE_TYPE: { NOTE: 'note' },
  replaceResourceTagRelations: vi.fn(),
  validateUserTags: vi.fn(),
}));
vi.mock('../util/resourceInbox.js', () => ({
  attachPendingStatus: vi.fn(),
  removeInboxRelations: vi.fn(),
}));
vi.mock('../util/services/noteService.js', () => ({ createNote: vi.fn() }));
vi.mock('../util/services/tagService.js', () => ({ createTag: vi.fn() }));
// 局部替换孤儿清理(fire-and-forget 查库删文件),其余 noteImages 函数保留真实实现走 mocked pool
const { cleanupSpy } = vi.hoisted(() => ({ cleanupSpy: vi.fn() }));
vi.mock('../util/noteImages.js', async (importOriginal) => ({
  ...(await importOriginal()),
  cleanupOrphanNoteImages: cleanupSpy,
}));

const {
  queryNoteTemplates,
  getNoteTemplateDetail,
  addNoteTemplate,
  updateNoteTemplate,
  duplicateNoteTemplate,
  delNoteTemplate,
} = await import('./noteLibraryHandle.js');

function mockRes() {
  return { send: vi.fn() };
}
const lastSent = (res) => res.send.mock.calls.at(-1)[0];

describe('笔记模板 handler', () => {
  let connection;

  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
    connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    getConnection.mockResolvedValue(connection);
  });

  it('queryNoteTemplates 只查询当前用户且不含 content 字段', async () => {
    poolQuery.mockResolvedValue([[{ id: 't1', name: '日报' }]]);
    const res = mockRes();
    await queryNoteTemplates({ user: { id: 'u1' } }, res);
    const [sql, params] = poolQuery.mock.calls[0];
    expect(params).toEqual(['u1']);
    expect(sql).not.toMatch(/content/i);
    expect(sql).toMatch(/revision/i);
    expect(lastSent(res).status).toBe(200);
  });

  it('getNoteTemplateDetail 非本人模板返回 404', async () => {
    poolQuery.mockResolvedValue([[]]);
    const res = mockRes();
    await getNoteTemplateDetail({ user: { id: 'u1' }, body: { id: 'other-tpl' } }, res);
    expect(lastSent(res).status).toBe(404);
  });

  it('addNoteTemplate 游客被拒绝且不触碰数据库', async () => {
    ensureNotVisitor.mockImplementation((req, res) => {
      res.send({ data: null, status: 403, msg: '游客无权限' });
      return false;
    });
    const res = mockRes();
    await addNoteTemplate({ user: { id: 'visitor' }, body: { name: 'x' } }, res);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('addNoteTemplate 名称为空返回 400', async () => {
    const res = mockRes();
    await addNoteTemplate({ user: { id: 'u1' }, body: { name: '   ', content: 'c' } }, res);
    expect(lastSent(res).status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('addNoteTemplate 非法类型返回 400', async () => {
    const res = mockRes();
    await addNoteTemplate({ user: { id: 'u1' }, body: { name: 'n', type: 'pdf', content: 'c' } }, res);
    expect(lastSent(res).status).toBe(400);
  });

  it('addNoteTemplate 达到 20 个上限时拒绝且不 INSERT', async () => {
    poolQuery.mockResolvedValueOnce([[{ n: 20 }]]);
    const res = mockRes();
    await addNoteTemplate({ user: { id: 'u1' }, body: { name: '新模板', type: 'html', content: 'c' } }, res);
    expect(lastSent(res).status).toBe(400);
    expect(poolQuery).toHaveBeenCalledTimes(1); // 只有 COUNT,没有 INSERT
  });

  it('addNoteTemplate 成功返回新 id,md 归一化为 markdown,titleTemplate 入库', async () => {
    poolQuery.mockResolvedValueOnce([[{ n: 3 }]]).mockResolvedValueOnce([{}]);
    const res = mockRes();
    await addNoteTemplate(
      {
        user: { id: 'u1' },
        body: { name: '周报', titleTemplate: '周报 {{date}}', type: 'md', content: '&gt; 本周摘要' },
      },
      res,
    );
    const sent = lastSent(res);
    expect(sent.status).toBe(200);
    expect(sent.data.id).toBe('tpl-new-id');
    const insertPayload = poolQuery.mock.calls[1][1][0];
    expect(insertPayload.type).toBe('markdown');
    expect(insertPayload.content).toBe('> 本周摘要');
    expect(insertPayload.createBy).toBe('u1');
    expect(insertPayload.titleTemplate).toBe('周报 {{date}}');
  });

  it('addNoteTemplate 正文含非本人上传图片时拒绝', async () => {
    // 归属过滤两路均未命中:note_images 无行、自己模板正文也不含该 URL
    poolQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ n: 0 }]]);
    const res = mockRes();
    await addNoteTemplate(
      {
        user: { id: 'u1' },
        body: { name: '带图模板', type: 'html', content: '<img src="https://boluo66.top/uploads/note-1-x.png">' },
      },
      res,
    );
    expect(lastSent(res).status).toBe(400);
    expect(poolQuery).toHaveBeenCalledTimes(2); // 归属校验失败即返回,不 COUNT 不 INSERT
  });

  it('addNoteTemplate 正文图片全部属于本人时放行', async () => {
    poolQuery
      .mockResolvedValueOnce([[{ url: 'https://boluo66.top/uploads/note-1-x.png' }]]) // 归属过滤:全部命中
      .mockResolvedValueOnce([[{ n: 0 }]]) // COUNT
      .mockResolvedValueOnce([{}]); // INSERT
    const res = mockRes();
    await addNoteTemplate(
      {
        user: { id: 'u1' },
        body: { name: '带图模板', type: 'html', content: '<img src="https://boluo66.top/uploads/note-1-x.png">' },
      },
      res,
    );
    expect(lastSent(res).status).toBe(200);
  });

  it('updateNoteTemplate revision 冲突时保留服务端版本且不更新', async () => {
    connection.query.mockResolvedValueOnce([
      [{ id: 't1', type: 'markdown', content: '# 远端', revision: 4, update_time: '2026-08-08 10:00:00' }],
    ]);
    const res = mockRes();
    await updateNoteTemplate(
      {
        user: { id: 'u1' },
        body: { id: 't1', baseRevision: 3, name: '周报', type: 'markdown', content: '# 本地' },
      },
      res,
    );
    expect(lastSent(res).status).toBe(409);
    expect(lastSent(res).data).toMatchObject({ code: 'NOTE_TEMPLATE_VERSION_CONFLICT', revision: 4 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('updateNoteTemplate 同格式更新并递增 revision，提交后清理移除的图片', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 't1',
            type: 'html',
            content: '<p>旧</p><img src="https://boluo66.top/uploads/note-1-x.png">',
            revision: 2,
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();
    await updateNoteTemplate(
      {
        user: { id: 'u1' },
        body: {
          id: 't1',
          baseRevision: 2,
          name: '新版模板',
          titleTemplate: '标题',
          description: '说明',
          type: 'html',
          content: '<p>新</p>',
        },
      },
      res,
    );
    expect(lastSent(res).status).toBe(200);
    expect(lastSent(res).data).toMatchObject({ id: 't1', name: '新版模板', revision: 3 });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(cleanupSpy).toHaveBeenCalledWith(['https://boluo66.top/uploads/note-1-x.png']);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('updateNoteTemplate 禁止直接切换模板格式', async () => {
    connection.query.mockResolvedValueOnce([[{ id: 't1', type: 'markdown', content: '# 旧', revision: 1 }]]);
    const res = mockRes();
    await updateNoteTemplate(
      {
        user: { id: 'u1' },
        body: { id: 't1', baseRevision: 1, name: '模板', type: 'html', content: '<p>新</p>' },
      },
      res,
    );
    expect(lastSent(res).status).toBe(400);
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('duplicateNoteTemplate 在事务中复制本人模板并生成不重名名称', async () => {
    connection.query
      .mockResolvedValueOnce([[{ id: 'u1' }]])
      .mockResolvedValueOnce([
        [{ name: '周报', title_template: '周报 {{date}}', description: '说明', type: 'markdown', content: '# 周报' }],
      ])
      .mockResolvedValueOnce([[{ name: '周报' }, { name: '周报 副本' }]])
      .mockResolvedValueOnce([{}]);
    const res = mockRes();
    await duplicateNoteTemplate({ user: { id: 'u1' }, headers: {}, body: { id: 't1' } }, res);
    expect(lastSent(res).status).toBe(200);
    expect(lastSent(res).data).toMatchObject({ id: 'tpl-new-id', name: '周报 副本 2', revision: 1 });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    const insertPayload = connection.query.mock.calls[3][1][0];
    expect(insertPayload).toMatchObject({ name: '周报 副本 2', content: '# 周报', createBy: 'u1' });
  });

  it('delNoteTemplate 归属不符返回 404 且不执行删除', async () => {
    poolQuery.mockResolvedValueOnce([[]]); // 先按归属查 content:查不到即 404
    const res = mockRes();
    await delNoteTemplate({ user: { id: 'u1' }, body: { id: 'not-mine' } }, res);
    expect(lastSent(res).status).toBe(404);
    expect(poolQuery).toHaveBeenCalledTimes(1);
    const [, params] = poolQuery.mock.calls[0];
    expect(params).toEqual(['not-mine', 'u1']);
    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  it('delNoteTemplate 成功删除后按正文图片触发孤儿清理', async () => {
    poolQuery
      .mockResolvedValueOnce([[{ content: '<img src="https://boluo66.top/uploads/note-1-x.png">' }]]) // 取正文
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE
    const res = mockRes();
    await delNoteTemplate({ user: { id: 'u1' }, body: { id: 't1' } }, res);
    expect(lastSent(res).status).toBe(200);
    expect(cleanupSpy).toHaveBeenCalledWith(['https://boluo66.top/uploads/note-1-x.png']);
  });
});

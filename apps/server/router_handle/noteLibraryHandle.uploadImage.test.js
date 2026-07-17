import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(() => connection);
const ensureNotVisitor = vi.fn(() => true);

vi.mock('../db/index.js', () => ({ default: { getConnection, query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  snakeCaseKeys: vi.fn((obj) => obj),
  mergeExistingProperties: vi.fn((obj) => obj),
  insertData: vi.fn((obj) => ({ ...obj, id: 'server-generated-id' })),
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
vi.mock('../util/noteImages.js', () => ({
  cleanupOrphanNoteImages: vi.fn(),
  extractNoteImageUrls: vi.fn(() => []),
  filterOwnedImageUrls: vi.fn(async () => []),
}));
// multer 已落盘文件的丢弃走 node:fs promises.unlink
const { unlinkSpy } = vi.hoisted(() => ({ unlinkSpy: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { unlink: unlinkSpy } }));

const { uploadNoteImage } = await import('./noteLibraryHandle.js');

function mockRes() {
  return { send: vi.fn() };
}
const lastSent = (res) => res.send.mock.calls.at(-1)[0];
const UPLOADED_PATH = '/www/wwwroot/images/note-123-a.png';
const baseReq = (extra = {}) => ({
  user: { id: 'u1', role: 'user' },
  file: { filename: 'note-123-a.png', path: UPLOADED_PATH },
  body: {},
  ...extra,
});

describe('uploadNoteImage 归属与事务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
    getConnection.mockResolvedValue(connection);
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    unlinkSpy.mockResolvedValue();
  });

  it('游客被拒绝且不触碰数据库', async () => {
    ensureNotVisitor.mockImplementation((req, res) => {
      res.send({ data: null, status: 403, msg: '游客无权限' });
      return false;
    });
    const res = mockRes();
    await uploadNoteImage(baseReq(), res);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('未携带文件返回 400', async () => {
    const res = mockRes();
    await uploadNoteImage(baseReq({ file: undefined }), res);
    expect(lastSent(res).status).toBe(400);
  });

  it('传入他人 noteId 时返回 404、不登记图片,且删除已落盘文件', async () => {
    poolQuery.mockResolvedValueOnce([[]]); // 归属校验:查不到
    const res = mockRes();
    await uploadNoteImage(baseReq({ body: { noteId: 'others-note' } }), res);
    expect(lastSent(res).status).toBe(404);
    expect(poolQuery).toHaveBeenCalledTimes(1); // 只有归属校验,无 INSERT
    const [, params] = poolQuery.mock.calls[0];
    expect(params).toEqual(['others-note', 'u1']);
    // 反复提交无效 noteId 不能在磁盘累积孤儿文件
    expect(unlinkSpy).toHaveBeenCalledWith(UPLOADED_PATH);
  });

  it('noteId 属于本人时登记图片并返回 url,不误删落盘文件', async () => {
    poolQuery.mockResolvedValueOnce([[{ id: 'my-note' }]]).mockResolvedValueOnce([{}]);
    const res = mockRes();
    await uploadNoteImage(baseReq({ body: { noteId: 'my-note' } }), res);
    const sent = lastSent(res);
    expect(sent.status).toBe(200);
    expect(sent.data.url).toContain('note-123-a.png');
    const insertPayload = poolQuery.mock.calls[1][1][0];
    expect(insertPayload.noteId).toBe('my-note');
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('noteId 分支 note_images 写入失败时也删除已落盘文件', async () => {
    poolQuery
      .mockResolvedValueOnce([[{ id: 'my-note' }]]) // 归属通过
      .mockRejectedValueOnce(new Error('insert failed')); // 登记失败
    const res = mockRes();
    await uploadNoteImage(baseReq({ body: { noteId: 'my-note' } }), res);
    expect(lastSent(res).status).toBe(500);
    expect(unlinkSpy).toHaveBeenCalledWith(UPLOADED_PATH);
  });

  it('无 noteId 时服务端生成笔记 id,笔记与图片同事务提交(不查全局最新笔记),成功不删文件', async () => {
    const res = mockRes();
    await uploadNoteImage(baseReq(), res);
    const sqls = connection.query.mock.calls.map(([sql]) => sql);
    expect(sqls).toEqual(['INSERT INTO note SET ?', 'INSERT INTO note_images SET ?']);
    expect(sqls.join(' ')).not.toMatch(/ORDER BY/i);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    const sent = lastSent(res);
    expect(sent.data.noteId).toBe('server-generated-id');
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('无 noteId 分支写库失败时回滚、返回稳定错误,并删除已落盘文件', async () => {
    connection.query.mockRejectedValueOnce(new Error('db broken: secret table'));
    const res = mockRes();
    await uploadNoteImage(baseReq(), res);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    const sent = lastSent(res);
    expect(sent.status).toBe(500);
    expect(sent.msg).not.toContain('secret'); // 不向前端泄漏原始数据库错误
    expect(unlinkSpy).toHaveBeenCalledWith(UPLOADED_PATH);
  });
});

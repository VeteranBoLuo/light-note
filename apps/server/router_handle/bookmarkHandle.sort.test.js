import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getConnection: vi.fn(), query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: mocks }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  L: (_req, zh) => zh,
}));
vi.mock('../util/obsClient.js', () => ({
  default: {},
  bucketBaseUrl: '',
  buildObjectKey: vi.fn(),
  createUploadSignedUrl: vi.fn(),
  createDownloadSignedUrl: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  copyObjectInObs: vi.fn(),
  putObjectToObs: vi.fn(),
  buildObjectUrl: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
}));
const { updateTagSort, updateBookmarkSort } = await import('./bookmarkHandle.js');
const id = (i) => '00000000-0000-0000-0000-' + String(i).padStart(12, '0');
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: id(i + 1), sort: n - i }));
let c;
beforeEach(() => {
  vi.clearAllMocks();
  c = {
    beginTransaction: vi.fn(),
    query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  mocks.getConnection.mockResolvedValue(c);
});
for (const [key, table, handler] of [
  ['tags', 'tag', updateTagSort],
  ['bookmarks', 'bookmark', updateBookmarkSort],
])
  describe(table + ' sort compatibility', () => {
    const run = async (input) => {
      const res = { send: vi.fn() };
      await handler(
        { user: { id: 'actor', role: 'user' }, resourceUser: { id: 'subject' }, body: { [key]: input } },
        res,
      );
      return res.send.mock.calls[0][0];
    };
    it('450 unique items retain supplied sort values and subject ownership in three chunks', async () => {
      expect((await run(items(450))).status).toBe(200);
      expect(c.query).toHaveBeenCalledTimes(3);
      expect(c.query.mock.calls.map(([, params]) => params.at(-1))).toEqual(['subject', 'subject', 'subject']);
      expect(c.query.mock.calls[1][1].slice(0, 4)).toEqual([id(201), 250, id(202), 249]);
      expect(c.commit).toHaveBeenCalledTimes(1);
      expect(c.rollback).not.toHaveBeenCalled();
      expect(c.release).toHaveBeenCalledTimes(1);
    });
    it('duplicates retain sequential last-write behavior instead of CASE first match', async () => {
      await run([
        { id: id(1), sort: 9 },
        { id: id(1), sort: 2 },
      ]);
      expect(c.query.mock.calls.map(([, params]) => params)).toEqual([
        [9, id(1), 'subject'],
        [2, id(1), 'subject'],
      ]);
    });
    it('string sort values retain legacy per-row coercion path', async () => {
      await run([
        { id: id(1), sort: '9' },
        { id: id(2), sort: 2 },
      ]);
      expect(c.query.mock.calls[0]).toEqual([
        `UPDATE ${table} SET sort = ? WHERE id = ? AND user_id = ?`,
        ['9', id(1), 'subject'],
      ]);
    });
    it('later chunk failure rolls back without committing and always releases', async () => {
      c.query.mockResolvedValueOnce([{ affectedRows: 200 }]).mockRejectedValueOnce(new Error('fixture failure'));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect((await run(items(450))).status).toBe(500);
        expect(c.query).toHaveBeenCalledTimes(2);
        expect(c.rollback).toHaveBeenCalledTimes(1);
        expect(c.commit).not.toHaveBeenCalled();
        expect(c.release).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

it('returns a conflict when an anchor leaves the selected tag', async () => {
  const rows = [{ id: id(1), isTop: 0, sort: 0 }, { id: id(2), isTop: 0, sort: 1 }];
  const move = { id: id(1), previousId: id(2), tagId: 'work' };
  c.query.mockResolvedValueOnce([rows]).mockResolvedValueOnce([[{ resource_id: move.id }]]);

  const res = { send: vi.fn() };
  await updateBookmarkSort({ user: { id: 'subject', role: 'user' }, body: { move } }, res);
  expect(res.send).toHaveBeenCalledWith(expect.objectContaining({
    status: 409,
    data: { errorCode: 'BOOKMARK_SORT_TAG_CHANGED' },
  }));
  expect(c.query).toHaveBeenCalledTimes(2);
  expect(c.rollback).toHaveBeenCalledTimes(1);
  expect(c.commit).not.toHaveBeenCalled();
});

it('rolls back a tagged move when a later sort batch fails', async () => {
  const rows = Array.from({ length: 102 }, (_, sort) => ({ id: id(sort + 1), isTop: 0, sort }));
  const move = { id: id(1), previousId: id(102), tagId: 'work' };
  c.query
    .mockResolvedValueOnce([rows])
    .mockResolvedValueOnce([[{ resource_id: move.id }, { resource_id: move.previousId }]])
    .mockResolvedValueOnce([{ affectedRows: 50 }])
    .mockRejectedValueOnce(new Error('fixture failure'));

  const res = { send: vi.fn() };
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await updateBookmarkSort({ user: { id: 'subject', role: 'user' }, body: { move } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
    expect(c.query).toHaveBeenCalledTimes(4);
    expect(c.query.mock.calls[2][1]).toHaveLength(151);
    expect(c.rollback).toHaveBeenCalledTimes(1);
    expect(c.commit).not.toHaveBeenCalled();
    expect(c.release).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
});

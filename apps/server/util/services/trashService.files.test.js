import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ files: [], connection: null }));
vi.mock('../../db/index.js', () => ({ default: { getConnection: async () => state.connection } }));
vi.mock('../personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
vi.mock('./noteTreeService.js', () => ({ previewOwnedNoteTrashRestore: vi.fn(), restoreOwnedNoteTrash: vi.fn() }));
vi.mock('../obsClient.js', () => ({ buildObjectKey: (user, name) => `files/${user}/${name}` }));
import { restoreTrashResources } from './trashService.js';

beforeEach(() => {
  state.files = [];
  state.connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql, params) => {
      if (sql.includes('FROM user')) return [[{ id: params[0] }]];
      if (sql.startsWith('SELECT id, file_name')) {
        return [
          state.files
            .filter(
              (f) =>
                f.create_by === params[0] &&
                f.del_flag === 1 &&
                (params.length === 1 || params.slice(1).includes(String(f.id))),
            )
            .map((f) => ({ ...f })),
        ];
      }
      const active = state.files.filter((f) => f.create_by === 'u' && f.del_flag === 0);
      if (sql.startsWith('SELECT id FROM files')) return [active.filter((f) => f.file_name === params[1])];
      if (sql.startsWith('SELECT MAX')) {
        const size = (params.length - 1) / 2;
        return [
          [
            Object.fromEntries(
              params
                .slice(0, size)
                .map((name, i) => [`occupied${i}`, Number(active.some((f) => f.file_name === name))]),
            ),
          ],
        ];
      }
      if (sql.startsWith('UPDATE files')) {
        const [name, fallbackKey, id, owner] = params;
        const file = state.files.find((f) => f.id === id && f.create_by === owner && f.del_flag === 1);
        if (!file) return [{ affectedRows: 0 }];
        file.file_name = name;
        file.obs_key ||= fallbackKey;
        file.del_flag = 0;
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected query');
    }),
  };
});
const file = (id, name, deleted, key, owner = 'u') => ({
  id,
  file_name: name,
  del_flag: deleted,
  obs_key: key,
  create_by: owner,
});
it('批量恢复跳过正常文件占用的序号，保留各自原件及账号隔离', async () => {
  state.files = [
    file(1, '图.png', 0, 'new'),
    file(2, '图 (1).png', 0, 'existing'),
    file(3, '图.png', 1, 'old-three'),
    file(4, '图.png', 1, 'old-four'),
    file(5, '图.png', 1, 'private', 'other'),
  ];
  expect(await restoreTrashResources({ userId: 'u', filters: { type: 'file', all: true } })).toEqual([
    { type: 'file', count: 2 },
  ]);
  expect(state.files.map((f) => [f.file_name, f.obs_key, f.del_flag])).toEqual([
    ['图.png', 'new', 0],
    ['图 (1).png', 'existing', 0],
    ['图 (2).png', 'old-three', 0],
    ['图 (3).png', 'old-four', 0],
    ['图.png', 'private', 1],
  ]);
  expect(state.connection.commit).toHaveBeenCalledOnce();
});
it('历史记录没有对象键时按旧名称固定原件地址，重复恢复不再改名', async () => {
  state.files = [file(1, '图.png', 0, 'new'), file(2, '图.png', 1, null)];
  const args = { userId: 'u', filters: { type: 'file', ids: ['2'] } };
  await restoreTrashResources(args);
  expect(state.files[1]).toMatchObject({ file_name: '图 (1).png', obs_key: 'files/u/图.png', del_flag: 0 });
  expect(await restoreTrashResources(args)).toEqual([]);
});
it('未被正常文件占用的名称直接恢复', async () => {
  state.files = [file(1, 'README', 1, 'original')];
  await restoreTrashResources({ userId: 'u', filters: { type: 'file', ids: ['1'] } });
  expect(state.files[0]).toMatchObject({ file_name: 'README', obs_key: 'original', del_flag: 0 });
});
it('失败回滚并释放连接', async () => {
  state.connection.query.mockRejectedValueOnce(new Error('database failed'));
  await expect(restoreTrashResources({ userId: 'u', filters: { type: 'file', all: true } })).rejects.toThrow(
    'database failed',
  );
  expect(state.connection.commit).not.toHaveBeenCalled();
  expect(state.connection.rollback).toHaveBeenCalledOnce();
  expect(state.connection.release).toHaveBeenCalledOnce();
});

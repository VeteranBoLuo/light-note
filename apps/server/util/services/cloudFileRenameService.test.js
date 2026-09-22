import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ cleanupConnection: vi.fn() }));
vi.mock('../obsClient.js', () => ({
  bucketBaseUrl: 'https://obs.invalid',
  buildObjectKey: (user, name) => `files/${user}/${name}`,
  copyObjectInObs: vi.fn().mockResolvedValue(),
  deleteObjectFromObs: vi.fn().mockResolvedValue(),
}));
vi.mock('../imagePreview/relocate.js', () => ({ relocateCloudImage: vi.fn().mockResolvedValue() }));
vi.mock('../aiDocument/service.js', () => ({ purgeDocumentSourcesForCloudFiles: vi.fn().mockResolvedValue() }));
vi.mock('../../db/index.js', () => ({ default: { getConnection: mocks.cleanupConnection } }));
import { copyObjectInObs, deleteObjectFromObs } from '../obsClient.js';
import { relocateCloudImage } from '../imagePreview/relocate.js';
import { renameOwnedCloudFile } from './cloudFileRenameService.js';
function db(file, duplicates = [], occupied = []) {
  return {
    query: vi.fn(async (sql) =>
      sql.startsWith('SELECT *')
        ? [[{ id: 1, create_by: 'u', ...file }]]
        : sql.startsWith('SELECT id')
          ? [sql.includes('obs_key') ? occupied : duplicates]
          : [{ affectedRows: 1 }],
    ),
  };
}
function cleanupDb(files = [], assets = []) {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => [
      sql.includes('image_assets') ? assets : sql.includes('obs_key') ? files : [{ id: 1 }],
    ]),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanupConnection.mockResolvedValue(cleanupDb());
});
it.each([
  ['report.PDF', '新名称', '新名称.PDF'],
  ['report.pdf', '新名称.pdf', '新名称.pdf'],
  ['README', '新名称', '新名称'],
])('保留扩展名并同步 OBS 名字 %s → %s', async (old, name, expected) => {
  const connection = db({ file_name: old, obs_key: 'files/u/stable-id.pdf' });
  const result = await renameOwnedCloudFile(connection, { userId: 'u', id: 1, name, preserveExtension: true });
  expect(result.name).toBe(expected);
  expect(relocateCloudImage).toHaveBeenCalledWith(
    connection,
    expect.objectContaining({ id: 1, create_by: 'u', obs_key: 'files/u/stable-id.pdf' }),
    `files/u/${expected}`,
    expected,
  );
  expect(copyObjectInObs).toHaveBeenCalledWith('files/u/stable-id.pdf', `files/u/${expected}`);
  expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE files'), [
    expected,
    `files/u/${expected}`,
    'https://obs.invalid/files/u/',
    1,
    'u',
  ]);
  expect(deleteObjectFromObs).not.toHaveBeenCalled();
  await result.cleanup();
  expect(deleteObjectFromObs).toHaveBeenCalledWith('files/u/stable-id.pdf');
});
it('名称未变化时不复制也不删除原对象', async () => {
  const result = await renameOwnedCloudFile(db({ file_name: 'report.pdf' }), {
    userId: 'u',
    id: 1,
    name: 'report.pdf',
    preserveExtension: true,
  });
  await result.cleanup();
  expect(copyObjectInObs).not.toHaveBeenCalled();
  expect(deleteObjectFromObs).not.toHaveBeenCalled();
  expect(relocateCloudImage).not.toHaveBeenCalled();
});
it('正常文件同名仍拒绝，不覆盖', async () => {
  const c = db({ file_name: 'old.pdf' }, [{ id: 2 }]);
  await expect(renameOwnedCloudFile(c, { userId: 'u', id: 1, name: 'new.pdf' })).rejects.toMatchObject({
    code: 'FILE_NAME_CONFLICT',
  });
  expect(copyObjectInObs).not.toHaveBeenCalled();
  expect(c.query.mock.calls.some(([s]) => s.startsWith('UPDATE'))).toBe(false);
});
it('复制失败不写文件名也不清理旧原图', async () => {
  const c = db({ file_name: 'old.jpg' });
  copyObjectInObs.mockRejectedValueOnce(Error('copy failed'));
  await expect(renameOwnedCloudFile(c, { userId: 'u', id: 1, name: 'new.jpg' })).rejects.toThrow('copy failed');
  expect(c.query.mock.calls.some(([s]) => s.startsWith('UPDATE'))).toBe(false);
  expect(deleteObjectFromObs).not.toHaveBeenCalled();
});
it.each(['file', 'asset'])('回收站或保留图片占用目标时使用独立地址 (%s)', async (kind) => {
  const c = db({ file_name: 'old.jpg', obs_key: 'files/u/old.jpg' }, [], kind === 'file' ? [{ id: 2 }] : []);
  if (kind === 'asset')
    relocateCloudImage.mockRejectedValueOnce(Object.assign(Error('conflict'), { code: 'FILE_IMAGE_TARGET_CONFLICT' }));
  const result = await renameOwnedCloudFile(c, { userId: 'u', id: 1, name: 'new.jpg' });
  expect(result.name).toBe('new.jpg');
  const target = copyObjectInObs.mock.calls[0][1];
  expect(target).toMatch(/^files\/u\/renamed\/[0-9a-f-]+\.jpg$/);
  expect(copyObjectInObs).toHaveBeenCalledExactlyOnceWith('files/u/old.jpg', target);
  expect(relocateCloudImage).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), target, 'new.jpg');
  expect(c.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE files'), [
    'new.jpg',
    target,
    'https://obs.invalid/files/u/',
    1,
    'u',
  ]);
  await result.cleanup();
  expect(deleteObjectFromObs).not.toHaveBeenCalledWith('files/u/new.jpg');
});
it('图片源状态冲突仍拒绝，不复制原件', async () => {
  relocateCloudImage.mockRejectedValueOnce(Object.assign(Error('conflict'), { code: 'FILE_IMAGE_SOURCE_CONFLICT' }));
  await expect(
    renameOwnedCloudFile(db({ file_name: 'old.jpg' }), { userId: 'u', id: 1, name: 'new.jpg' }),
  ).rejects.toMatchObject({ code: 'FILE_IMAGE_SOURCE_CONFLICT' });
  expect(copyObjectInObs).not.toHaveBeenCalled();
});
it.each(['file', 'asset'])('延迟清理时旧地址重新被使用则保留原图 (%s)', async (kind) => {
  const cleanup = cleanupDb(kind === 'file' ? [{ id: 1 }] : [], kind === 'asset' ? [{ id: 8 }] : []);
  mocks.cleanupConnection.mockResolvedValue(cleanup);
  const result = await renameOwnedCloudFile(db({ file_name: 'old.jpg' }), { userId: 'u', id: 1, name: 'new.jpg' });
  await result.cleanup();
  expect(deleteObjectFromObs).not.toHaveBeenCalled();
  expect(cleanup.commit).toHaveBeenCalled();
  expect(cleanup.release).toHaveBeenCalled();
});

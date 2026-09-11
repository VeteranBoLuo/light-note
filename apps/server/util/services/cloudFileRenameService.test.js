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
it.each(['name', 'object'])('名称或对象地址冲突均不复制、不覆盖 (%s)', async (kind) => {
  const c = db({ file_name: 'old.pdf' }, kind === 'name' ? [{ id: 2 }] : [], kind === 'object' ? [{ id: 2 }] : []);
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
it('图片资产冲突在复制前失败', async () => {
  relocateCloudImage.mockRejectedValueOnce(Object.assign(Error('conflict'), { code: 'FILE_IMAGE_TARGET_CONFLICT' }));
  await expect(
    renameOwnedCloudFile(db({ file_name: 'old.jpg' }), { userId: 'u', id: 1, name: 'new.jpg' }),
  ).rejects.toMatchObject({ code: 'FILE_IMAGE_TARGET_CONFLICT' });
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

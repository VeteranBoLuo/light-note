import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../obsClient.js', () => ({
  bucketBaseUrl: 'https://obs.invalid',
  buildObjectKey: (user, name) => `files/${user}/${name}`,
  copyObjectInObs: vi.fn().mockResolvedValue(),
  deleteObjectFromObs: vi.fn().mockResolvedValue(),
}));
vi.mock('../aiDocument/service.js', () => ({ purgeDocumentSourcesForCloudFiles: vi.fn().mockResolvedValue() }));
vi.mock('../../db/index.js', () => ({ default: {} }));
import { copyObjectInObs, deleteObjectFromObs } from '../obsClient.js';
import { renameOwnedCloudFile } from './cloudFileRenameService.js';
function db(file, duplicates = []) {
  return {
    query: vi.fn(async (sql) =>
      sql.startsWith('SELECT *')
        ? [[{ id: 1, ...file }]]
        : sql.startsWith('SELECT id')
          ? [duplicates]
          : [{ affectedRows: 1 }],
    ),
  };
}
beforeEach(() => vi.clearAllMocks());
it.each([
  ['report.PDF', '新名称', '新名称.PDF'],
  ['report.pdf', '新名称.pdf', '新名称.pdf'],
  ['README', '新名称', '新名称'],
])('保留扩展名 %s → %s', async (old, name, expected) => {
  const result = await renameOwnedCloudFile(db({ file_name: old }), {
    userId: 'u',
    id: 1,
    name,
    preserveExtension: true,
  });
  expect(result.name).toBe(expected);
  expect(deleteObjectFromObs).not.toHaveBeenCalled();
  await result.cleanup();
  expect(copyObjectInObs).toHaveBeenCalledWith(`files/u/${old}`, `files/u/${expected}`);
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
});
it('同名冲突和复制失败不写名称', async () => {
  await expect(
    renameOwnedCloudFile(db({ file_name: 'old.pdf' }, [{ id: 2 }]), { userId: 'u', id: 1, name: 'new.pdf' }),
  ).rejects.toMatchObject({ code: 'FILE_NAME_CONFLICT' });
  const c = db({ file_name: 'old.pdf' });
  copyObjectInObs.mockRejectedValueOnce(Error('copy failed'));
  await expect(renameOwnedCloudFile(c, { userId: 'u', id: 1, name: 'new.pdf' })).rejects.toThrow('copy failed');
  expect(c.query.mock.calls.some(([s]) => s.startsWith('UPDATE'))).toBe(false);
});

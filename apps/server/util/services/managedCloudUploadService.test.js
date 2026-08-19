import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: { query: vi.fn(), getConnection: vi.fn() },
  getUserSpaceMb: vi.fn(),
  getAccountedStorageBytes: vi.fn(),
  createUploadSignedUrl: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
  triggerResourceCreateEffects: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ default: mocks.pool }));
vi.mock('../growth.js', () => ({ getUserSpaceMb: mocks.getUserSpaceMb }));
vi.mock('../storageUsage.js', () => ({
  BYTES_PER_MB: 1024 * 1024,
  getAccountedStorageBytes: mocks.getAccountedStorageBytes,
  storageBytesToMb: (value) => Number((Number(value || 0) / 1024 / 1024).toFixed(2)),
}));
vi.mock('../obsClient.js', () => ({
  bucketBaseUrl: 'https://bucket.example',
  createUploadSignedUrl: mocks.createUploadSignedUrl,
  deleteObjectFromObs: mocks.deleteObjectFromObs,
  getObjectMetadataFromObs: mocks.getObjectMetadataFromObs,
}));
vi.mock('./resourceCreateEffects.js', () => ({ triggerResourceCreateEffects: mocks.triggerResourceCreateEffects }));

const { abortManagedCloudUpload, buildManagedCloudObjectKey, confirmManagedCloudUpload, prepareManagedCloudUpload } =
  await import('./managedCloudUploadService.js');

const objectKey = 'files/user-1/uploads/93c12b32-76ad-4ca0-85f7-20df7736a454.pdf';

function connectionWith(query) {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(query),
  };
}

describe('managedCloudUploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserSpaceMb.mockResolvedValue(1024);
    mocks.getAccountedStorageBytes.mockResolvedValue(0);
    mocks.createUploadSignedUrl.mockReturnValue({ url: 'https://upload.example', headers: {}, expiresIn: 900 });
    mocks.getObjectMetadataFromObs.mockResolvedValue({ contentLength: 2048, contentType: 'application/pdf' });
    mocks.deleteObjectFromObs.mockResolvedValue({});
    mocks.triggerResourceCreateEffects.mockResolvedValue(undefined);
    mocks.pool.query.mockResolvedValue([[]]);
  });

  it('使用随机对象键而不是展示文件名，避免同名上传先覆盖旧对象', async () => {
    const key = buildManagedCloudObjectKey('user-1', '季度报告.pdf');
    expect(key).toMatch(/^files\/user-1\/uploads\/[0-9a-f-]{36}\.pdf$/u);
    expect(key).not.toContain('季度报告');

    await expect(
      prepareManagedCloudUpload({
        userId: 'user-1',
        userRole: 'user',
        fileName: '季度报告.pdf',
        fileType: 'application/pdf',
        fileSize: 2048,
      }),
    ).resolves.toEqual(expect.objectContaining({ uploadUrl: 'https://upload.example' }));
  });

  it('同名时在账号行锁内自动改名，并保留旧文件记录', async () => {
    let nameChecks = 0;
    const connection = connectionWith(async (sql) => {
      const text = String(sql);
      if (text.includes('obs_key = ?')) return [[]];
      if (text.includes('file_name = ?')) {
        nameChecks += 1;
        return nameChecks === 1 ? [[{ id: 8 }]] : [[]];
      }
      if (text === 'INSERT INTO files SET ?') return [{ insertId: 19 }];
      return [[]];
    });
    mocks.pool.getConnection.mockResolvedValue(connection);

    const result = await confirmManagedCloudUpload({
      userId: 'user-1',
      userRole: 'user',
      objectKey,
      fileName: '季度报告.pdf',
      fileType: 'application/pdf',
      folderId: null,
    });

    expect(connection.query).toHaveBeenCalledWith('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', ['user-1']);
    expect(connection.query).toHaveBeenCalledWith('INSERT INTO files SET ?', [
      expect.objectContaining({ file_name: '季度报告 (1).pdf', obs_key: objectKey, file_size: 2048 }),
    ]);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).startsWith('DELETE FROM files'))).toBe(false);
    expect(result).toEqual(expect.objectContaining({ fileId: '19', filename: '季度报告 (1).pdf' }));
  });

  it('拒绝不属于当前账号的文件夹并清理已上传随机对象', async () => {
    const connection = connectionWith(async (sql) => {
      if (String(sql).includes('obs_key = ?')) return [[]];
      if (String(sql).includes('FROM folders')) return [[]];
      return [[]];
    });
    mocks.pool.getConnection.mockResolvedValue(connection);

    await expect(
      confirmManagedCloudUpload({
        userId: 'user-1',
        userRole: 'user',
        objectKey,
        fileName: '季度报告.pdf',
        fileType: 'application/pdf',
        folderId: '99',
      }),
    ).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(mocks.deleteObjectFromObs).toHaveBeenCalledWith(objectKey);
  });

  it('提交回包异常时先按对象键核验，已落库则按幂等成功返回且不删对象', async () => {
    const committed = {
      id: 21,
      file_name: '季度报告.pdf',
      file_type: 'application/pdf',
      file_size: 2048,
      folder_id: null,
      obs_key: objectKey,
    };
    mocks.pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[committed]]);
    const connection = connectionWith(async (sql) => {
      const text = String(sql);
      if (text.includes('obs_key = ?')) return [[]];
      if (text.includes('file_name = ?')) return [[]];
      if (text === 'INSERT INTO files SET ?') return [{ insertId: 21 }];
      return [[]];
    });
    connection.commit.mockRejectedValue(new Error('connection lost after commit'));
    mocks.pool.getConnection.mockResolvedValue(connection);

    await expect(
      confirmManagedCloudUpload({
        userId: 'user-1',
        userRole: 'user',
        objectKey,
        fileName: '季度报告.pdf',
        fileType: 'application/pdf',
      }),
    ).resolves.toEqual(expect.objectContaining({ fileId: '21', alreadyConfirmed: true }));
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });

  it('中止上传先取得与确认相同的账号锁，已落库对象绝不删除', async () => {
    const connection = connectionWith(async (sql) => {
      if (String(sql).includes('obs_key = ?')) {
        return [[{ id: 30, file_name: '资料.pdf', file_type: 'application/pdf', file_size: 2048 }]];
      }
      return [[]];
    });
    mocks.pool.getConnection.mockResolvedValue(connection);

    await expect(abortManagedCloudUpload({ userId: 'user-1', objectKey })).resolves.toEqual({
      deleted: false,
      alreadyConfirmed: true,
    });
    expect(connection.query.mock.calls[0]).toEqual([
      'SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE',
      ['user-1'],
    ]);
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });
});

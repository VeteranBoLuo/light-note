import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: { query: vi.fn(), getConnection: vi.fn() },
  getUserSpaceMb: vi.fn(),
  getAccountedStorageBytes: vi.fn(),
  createUploadSignedUrl: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
  triggerResourceCreateEffects: vi.fn(),
  enqueueResources: vi.fn(),
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
vi.mock('../resourceInbox.js', () => ({ enqueueResources: mocks.enqueueResources }));

const { abortManagedCloudUpload, buildManagedCloudObjectKey, confirmManagedCloudUpload, prepareManagedCloudUpload } =
  await import('./managedCloudUploadService.js');

const objectKey = 'files/user-1/uploads/93c12b32-76ad-4ca0-85f7-20df7736a454.pdf';

function connectionWith(query) {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn((sql, ...args) => {
      if (sql.includes('GET_LOCK(')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK(')) return [[{ released: 1 }]];
      return query(sql, ...args);
    }),
    destroy: vi.fn(),
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
    mocks.enqueueResources.mockResolvedValue({ added: 1, reopened: 0, ignored: 0 });
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

  it.each([
    { occupied: 100, expected: '资料 (100).pdf' },
    { occupied: 999, expected: '资料 (999).pdf' },
    { occupied: 1000, expected: null },
  ])('大量同名文件分批选取首个空位，保留千个候选的上限：$occupied', async ({ occupied, expected }) => {
    const names = new Set(Array.from({ length: occupied }, (_, i) => i ? `资料 (${i}).pdf` : '资料.pdf'));
    let nameQueries = 0;
    const connection = connectionWith(async (sql, params) => {
      const text = String(sql);
      if (text.includes('MAX(file_name')) {
        nameQueries += 1;
        const size = (params.length - 1) / 2;
        expect(size).toBeLessThanOrEqual(32);
        expect(params[size]).toBe('user-1');
        return [[Object.fromEntries(params.slice(0, size).map((name, i) => [`occupied${i}`, Number(names.has(name))]))]];
      }
      if (text.includes('file_name = ?')) {
        nameQueries += 1;
        return [names.has(params[1]) ? [{ id: 8 }] : []];
      }
      if (text === 'INSERT INTO files SET ?') return [{ insertId: 29 }];
      return [[]];
    });
    mocks.pool.getConnection.mockResolvedValue(connection);
    const result = confirmManagedCloudUpload({ userId: 'user-1', objectKey, fileName: '资料.pdf' });
    if (expected) {
      await expect(result).resolves.toMatchObject({ filename: expected });
    } else {
      await expect(result).rejects.toMatchObject({ code: 'FILE_NAME_CONFLICT' });
      expect(connection.query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO files'))).toBe(false);
    }
    expect(nameQueries).toBeLessThanOrEqual(33);
  });

  it('浏览器插件确认文件时在文件事务内同步加入待整理', async () => {
    const connection = connectionWith(async (sql) => {
      const text = String(sql);
      if (text.includes('obs_key = ?')) return [[]];
      if (text.includes('file_name = ?')) return [[]];
      if (text === 'INSERT INTO files SET ?') return [{ insertId: 23 }];
      return [[]];
    });
    mocks.pool.getConnection.mockResolvedValue(connection);

    const result = await confirmManagedCloudUpload({
      userId: 'user-1',
      userRole: 'user',
      objectKey,
      fileName: '资料.pdf',
      fileType: 'application/pdf',
      addToInbox: true,
      inboxSource: 'browser_extension',
    });

    expect(mocks.enqueueResources).toHaveBeenCalledWith(connection, {
      userId: 'user-1',
      items: [{ resourceType: 'file', resourceId: '23' }],
      source: 'browser_extension',
    });
    expect(mocks.enqueueResources.mock.invocationCallOrder[0]).toBeLessThan(connection.commit.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({ fileId: '23', addedToInbox: true });
  });

  it('已确认文件补入待整理时仍进入事务，且不重复查询 OBS 或创建文件', async () => {
    const existing = {
      id: 24,
      file_name: '资料.pdf',
      file_type: 'application/pdf',
      file_size: 2048,
      folder_id: null,
      obs_key: objectKey,
    };
    mocks.pool.query.mockResolvedValueOnce([[existing]]);
    const connection = connectionWith(async (sql) => {
      if (String(sql).includes('obs_key = ?')) return [[existing]];
      return [[]];
    });
    mocks.pool.getConnection.mockResolvedValue(connection);

    await expect(
      confirmManagedCloudUpload({
        userId: 'user-1',
        userRole: 'user',
        objectKey,
        fileName: '资料.pdf',
        fileType: 'application/pdf',
        addToInbox: true,
        inboxSource: 'browser_extension',
      }),
    ).resolves.toMatchObject({ fileId: '24', alreadyConfirmed: true, addedToInbox: true });

    expect(mocks.enqueueResources).toHaveBeenCalledOnce();
    expect(mocks.getObjectMetadataFromObs).not.toHaveBeenCalled();
    expect(connection.query.mock.calls.some(([sql]) => sql === 'INSERT INTO files SET ?')).toBe(false);
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

  it('确认失败回滚后，清理前发现另一请求已保存同一对象时不删除', async () => {
    const failed = connectionWith(async () => [[]]);
    const cleanup = connectionWith(async (sql) => String(sql).includes('obs_key = ?')
      ? [[{ id: 31, file_name: '资料.pdf', file_type: 'application/pdf', file_size: 2048 }]] : [[]]);
    mocks.pool.getConnection.mockResolvedValueOnce(failed).mockResolvedValueOnce(cleanup);
    await expect(confirmManagedCloudUpload({ userId: 'user-1', objectKey, fileName: '资料.pdf', folderId: '99' }))
      .rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    expect(failed.rollback).toHaveBeenCalledOnce();
    expect(cleanup.commit).toHaveBeenCalledOnce();
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

    await expect(abortManagedCloudUpload({ userId: 'user-1', objectKey })).resolves.toMatchObject({
      deleted: false,
      alreadyConfirmed: true,
      fileId: '30',
      filename: '资料.pdf',
    });
    expect(connection.query.mock.calls[1]).toEqual([
      'SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE',
      ['user-1'],
    ]);
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });

  it('中止删除尚未完成时释放账号锁但保留对象锁', async () => {
    const connection = connectionWith(async () => [[]]);
    mocks.pool.getConnection.mockResolvedValue(connection);
    let finishDelete;
    let started;
    const deleting = new Promise((resolve) => { started = resolve; });
    mocks.deleteObjectFromObs.mockImplementation(() => {
      started();
      return new Promise((resolve) => { finishDelete = resolve; });
    });
    const pending = abortManagedCloudUpload({ userId: 'user-1', objectKey });
    await deleting;
    try {
      expect(connection.commit).toHaveBeenCalledOnce();
      expect(connection.query.mock.calls.some(([sql]) => sql.includes('RELEASE_LOCK('))).toBe(false);
      expect(connection.release).not.toHaveBeenCalled();
    } finally {
      finishDelete({});
      await pending;
    }
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('对象删除失败时不谎报已删除，允许客户端保留原对象凭据', async () => {
    const connection = connectionWith(async () => [[]]);
    mocks.pool.getConnection.mockResolvedValue(connection);
    mocks.deleteObjectFromObs.mockRejectedValue(new Error('OBS unavailable'));
    await expect(abortManagedCloudUpload({ userId: 'user-1', objectKey })).rejects.toThrow('OBS unavailable');
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });
  it('对象锁忙时不读取或删除对象、不等待账号锁', async () => {
    const connection = connectionWith(async () => [[]]);
    connection.query.mockResolvedValue([[{ acquired: 0 }]]);
    mocks.pool.getConnection.mockResolvedValue(connection);
    await expect(abortManagedCloudUpload({ userId: 'user-1', objectKey })).rejects.toMatchObject({ code: 'UPLOAD_BUSY' });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });
  it('对象锁释放失败时销毁连接，不将锁泄漏到连接池', async () => {
    const connection = connectionWith(async () => [[]]);
    const query = connection.query.getMockImplementation();
    connection.query.mockImplementation((sql, ...args) => sql.includes('RELEASE_LOCK(')
      ? Promise.reject(new Error('connection lost')) : query(sql, ...args));
    mocks.pool.getConnection.mockResolvedValue(connection);
    await expect(abortManagedCloudUpload({ userId: 'user-1', objectKey })).resolves.toMatchObject({ deleted: true });
    expect(connection.destroy).toHaveBeenCalledOnce();
  });

});

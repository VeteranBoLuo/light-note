vi.mock('../util/services/cloudObjectPublication.js', () => ({ lockCloudObjectForPublication: vi.fn() }));
vi.mock('../util/imagePreview/cleanup.js', () => ({
  deleteUnmanagedObject: (...args) => mocks.deleteObjectFromObs(...args),
}));
vi.mock('../util/services/cloudLegacyObjectLifecycle.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    lockActiveUploadOwner: (connection, userId) =>
      mocks.realLifecycle
        ? actual.lockActiveUploadOwner(connection, userId)
        : connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]),
    prepareLegacyCloudUpload: (...args) =>
      mocks.realLifecycle
        ? actual.prepareLegacyCloudUpload(...args)
        : Promise.resolve({
            ...mocks.createUploadSignedUrl({
              objectKey: `files/${args[0].userId}/${args[0].fileName}`,
              contentType: args[0].fileType,
            }),
            objectKey: `files/${args[0].userId}/${args[0].fileName}`,
          }),
    reserveLegacyUploadConfirmation: (...args) =>
      mocks.realLifecycle
        ? actual.reserveLegacyUploadConfirmation(...args)
        : Promise.resolve({
            generation: 'test-generation',
            objectKey: args[0].objectKey || `files/${args[0].userId}/${args[0].fileName}`,
          }),
    lockLegacyUploadForConfirmation: (...args) =>
      mocks.realLifecycle ? actual.lockLegacyUploadForConfirmation(...args) : Promise.resolve(),
  };
});
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  realLifecycle: false,
  putObjectToObs: vi.fn(),
  routes: new Map(),
  pool: { query: vi.fn(), getConnection: vi.fn() },
  getUserSpaceMb: vi.fn(),
  awardCreate: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
  createUploadSignedUrl: vi.fn(() => ({ url: 'https://upload.example', headers: {}, expiresIn: 900 })),
  removeInboxRelations: vi.fn(),
  purgeDocumentSourcesForCloudFiles: vi.fn(),
  recordFirstOwnResource: vi.fn(),
}));

vi.mock('express', () => ({
  default: {
    Router: () => ({
      get(path, ...handlers) {
        mocks.routes.set(path, handlers);
      },
      post(path, ...handlers) {
        mocks.routes.set(path, handlers);
      },
    }),
  },
}));
vi.mock('multer', () => ({ default: () => ({ single: () => (_req, _res, next) => next?.() }) }));
vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg = '') => ({ data, status, msg }),
  snakeCaseKeys: (value) => value,
  L: (_req, zh) => zh,
}));
vi.mock('../util/growth.js', () => ({
  awardCreate: mocks.awardCreate,
  getUserSpaceMb: mocks.getUserSpaceMb,
}));
vi.mock('../util/obsClient.js', () => ({
  bucketBaseUrl: 'https://bucket.example',
  buildObjectKey: (userId, fileName) => `files/${userId}/${fileName}`,
  buildObjectUrl: (key) => `https://bucket.example/${key}`,
  createDownloadSignedUrl: () => ({ url: 'https://signed.example' }),
  createUploadSignedUrl: mocks.createUploadSignedUrl,
  deleteObjectFromObs: mocks.deleteObjectFromObs,
  getObjectMetadataFromObs: mocks.getObjectMetadataFromObs,
  putObjectToObs: mocks.putObjectToObs,
}));
vi.mock('../util/fileCategory.js', () => ({
  FILE_CATEGORY_ORDER: ['pdf', 'image'],
  buildFileCategorySql: () => 'files.category',
  getFileExtension: () => '',
  resolveFileCategory: () => 'other',
}));
vi.mock('../router_handle/fileHandle.js', () => ({
  updateFile: vi.fn(),
  getFileInfo: vi.fn(),
  queryFolder: vi.fn(),
  addFolder: vi.fn(),
  ensureFolder: vi.fn(),
  associateFile: vi.fn(),
  updateFolder: vi.fn(),
  moveFolder: vi.fn(),
  deleteFolder: vi.fn(),
  clearFolderFiles: vi.fn(),
  updateFolderSort: vi.fn(),
  getFileTags: vi.fn(),
  updateFileTags: vi.fn(),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: () => true }));
vi.mock('../util/conversion.js', () => ({ recordFirstOwnResource: mocks.recordFirstOwnResource }));
vi.mock('../util/resourceInbox.js', () => ({
  attachPendingStatus: vi.fn(),
  enqueueResources: vi.fn(),
  removeInboxRelations: mocks.removeInboxRelations,
}));
vi.mock('../util/aiDocument/service.js', () => ({
  purgeDocumentSourcesForCloudFiles: mocks.purgeDocumentSourcesForCloudFiles,
}));
vi.mock('../util/services/managedCloudUploadService.js', () => ({
  prepareManagedCloudUpload: vi.fn(),
  confirmManagedCloudUpload: vi.fn(),
  abortManagedCloudUpload: vi.fn(),
}));

await import('./file.js');

function response() {
  return {
    send: vi.fn(),
    status: vi.fn(function status() {
      return this;
    }),
  };
}

function request() {
  return {
    user: { id: 'user-1', role: 'user' },
    body: {
      files: [{ fileName: 'avatar.png', fileType: 'image/png', fileSize: 1024 }],
      folderId: null,
    },
  };
}

describe('云空间普通上传覆盖随机 OBS 对象', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserSpaceMb.mockResolvedValue(1024);
    mocks.awardCreate.mockResolvedValue({});
    mocks.deleteObjectFromObs.mockResolvedValue({});
    mocks.getObjectMetadataFromObs.mockResolvedValue({ contentLength: 1024, contentType: 'image/png' });
  });

  it('签发上传地址前就按正常区与回收站共享容量阻止明显越额文件', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.startsWith('SELECT id, file_name, del_flag FROM files')) return [[]];
      if (text.includes('del_flag IN (0, 1)')) return [[{ used: 900 * 1024 * 1024 }]];
      if (text.includes('file_name IN')) return [[{ used: 0 }]];
      return [[]];
    });
    const req = request();
    req.body.files = [{ fileName: 'large.zip', fileType: 'application/zip', fileSize: 200 * 1024 * 1024 }];
    const res = response();
    const handler = mocks.routes.get('/uploadFiles').at(-1);

    await handler(req, res);

    expect(mocks.pool.query.mock.calls.some(([sql]) => String(sql).includes('del_flag IN (0, 1)'))).toBe(true);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 413,
        data: expect.objectContaining({ errorCode: 'STORAGE_QUOTA_EXCEEDED', shortfallMB: 76 }),
      }),
    );
  });

  it('事务提交成功后清理被同名上传替换的 AI 随机对象', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.startsWith('SELECT id, file_name, del_flag FROM files')) return [[]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.startsWith('SELECT * FROM files')) {
          return [[{ id: 5, file_name: 'avatar.png', obs_key: 'files/user-1/ai/random.png' }]];
        }
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 6 }];
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    const res = response();
    const handler = mocks.routes.get('/confirmUpload').at(-1);

    await handler(request(), res);

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', ['user-1']);
    expect(mocks.deleteObjectFromObs).toHaveBeenCalledWith('files/user-1/ai/random.png');
    expect(connection.query).toHaveBeenCalledWith('UPDATE files SET ? WHERE id = ? AND create_by = ?', [
      expect.objectContaining({ file_name: 'avatar.png', obs_key: 'files/user-1/avatar.png' }),
      5,
      'user-1',
    ]);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('数据库事务失败时不删除仍被旧记录引用的随机对象', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.startsWith('SELECT id, file_name, del_flag FROM files')) return [[]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.startsWith('SELECT * FROM files')) {
          return [[{ id: 5, file_name: 'avatar.png', obs_key: 'files/user-1/ai/random.png' }]];
        }
        if (text.startsWith('UPDATE files SET')) throw new Error('update failed');
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    const res = response();
    const handler = mocks.routes.get('/confirmUpload').at(-1);

    await handler(request(), res);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
  });

  it('以 OBS 实际大小写库，不信任客户端上报的 fileSize', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.startsWith('SELECT id, file_name, del_flag FROM files')) return [[]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.startsWith('SELECT * FROM files')) return [[]];
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 7 }];
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    mocks.getObjectMetadataFromObs.mockResolvedValue({ contentLength: 4096, contentType: 'image/png' });
    const req = request();
    req.body.files[0].fileSize = 1;
    const res = response();
    const handler = mocks.routes.get('/confirmUpload').at(-1);

    await handler(req, res);

    expect(connection.query).toHaveBeenCalledWith('INSERT INTO files SET ?', [
      expect.objectContaining({ file_name: 'avatar.png', file_size: 4096 }),
    ]);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('账号配额足够时允许确认 4GB 文件', async () => {
    const fourGb = 4 * 1024 * 1024 * 1024;
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.startsWith('SELECT id, file_name, del_flag FROM files')) return [[]];
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.startsWith('SELECT * FROM files')) return [[]];
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 8 }];
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    mocks.getUserSpaceMb.mockResolvedValue(5 * 1024);
    mocks.getObjectMetadataFromObs.mockResolvedValue({ contentLength: fourGb, contentType: 'application/zip' });
    const res = response();
    const handler = mocks.routes.get('/confirmUpload').at(-1);

    await handler(request(), res);

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith('INSERT INTO files SET ?', [
      expect.objectContaining({ file_size: fourGb }),
    ]);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('OBS 实际大小超过账号剩余配额时拒绝写库', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SUM(file_size)')) return [[{ used: 0 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    mocks.getObjectMetadataFromObs.mockResolvedValue({
      contentLength: 1025 * 1024 * 1024,
      contentType: 'application/zip',
    });
    const res = response();
    const handler = mocks.routes.get('/confirmUpload').at(-1);

    await handler(request(), res);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalledWith('INSERT INTO files SET ?', expect.anything());
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 413 }));
  });

  it('把回收站文件计入共享容量后拒绝越额上传', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.startsWith('SELECT id, file_name, del_flag FROM files')) return [[]];
        if (text.includes('del_flag IN (0, 1)')) return [[{ used: 900 * 1024 * 1024 }]];
        if (text.includes('file_name IN')) return [[{ used: 0 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    mocks.getObjectMetadataFromObs.mockResolvedValue({
      contentLength: 200 * 1024 * 1024,
      contentType: 'application/zip',
    });
    const res = response();
    const handler = mocks.routes.get('/confirmUpload').at(-1);

    await handler(request(), res);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('del_flag IN (0, 1)'))).toBe(true);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 413,
        data: expect.objectContaining({ errorCode: 'STORAGE_QUOTA_EXCEEDED', shortfallMB: 76 }),
      }),
    );
  });

  it('同名覆盖按新旧文件差额核算，替换为更小文件不会误报容量不足', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.startsWith('SELECT id, file_name, del_flag FROM files')) return [[]];
        if (text.includes('del_flag IN (0, 1)')) return [[{ used: 1020 * 1024 * 1024 }]];
        if (text.includes('file_name IN')) return [[{ used: 100 * 1024 * 1024 }]];
        if (text.startsWith('SELECT * FROM files')) {
          return [
            [{ id: 5, file_name: 'avatar.png', file_size: 100 * 1024 * 1024, obs_key: 'files/user-1/avatar.png' }],
          ];
        }
        if (text === 'INSERT INTO files SET ?') return [{ insertId: 9 }];
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    mocks.getObjectMetadataFromObs.mockResolvedValue({
      contentLength: 80 * 1024 * 1024,
      contentType: 'image/png',
    });
    const res = response();
    const handler = mocks.routes.get('/confirmUpload').at(-1);

    await handler(request(), res);

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('容量接口返回正常区与回收站拆分，并以两者合计作为已用空间', async () => {
    mocks.pool.query.mockResolvedValueOnce([
      [{ activeBytes: 100 * 1024 * 1024, trashBytes: 25 * 1024 * 1024, totalBytes: 125 * 1024 * 1024 }],
    ]);
    const res = response();
    const handler = mocks.routes.get('/queryTotalFileSize').at(-1);

    await handler(request(), res);

    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: {
          totalSizeMB: 125,
          activeSizeMB: 100,
          trashSizeMB: 25,
          quotaMB: 1024,
          sharedWithTrash: true,
        },
      }),
    );
  });
});

vi.mock('../util/imagePreview/references.js', () => ({ registerCloudImage: vi.fn(), removeImageReferences: vi.fn() }));

vi.mock('../util/imagePreview/cleanup.js', () => ({
  deleteUnmanagedObject: (...args) => mocks.deleteObjectFromObs(...args),
}));

describe('容量接口并发读取', () => {
  beforeEach(() => {
    mocks.pool.query.mockReset();
    mocks.getUserSpaceMb.mockReset();
  });
  it('同时读取用量与配额，等待两项结果后返回', async () => {
    let finishUsage;
    mocks.pool.query.mockReturnValueOnce(
      new Promise((resolve) => {
        finishUsage = resolve;
      }),
    );
    mocks.getUserSpaceMb.mockResolvedValueOnce(2048);
    const res = response();
    const done = mocks.routes.get('/queryTotalFileSize').at(-1)(request(), res);
    expect(mocks.getUserSpaceMb).toHaveBeenCalledOnce();
    expect(mocks.getUserSpaceMb).toHaveBeenCalledWith('user-1', 'user');
    await Promise.resolve();
    expect(res.send).not.toHaveBeenCalled();
    finishUsage([[{ activeBytes: 1048576, trashBytes: 524288, totalBytes: 1572864 }]]);
    await done;
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: {
          totalSizeMB: 1.5,
          activeSizeMB: 1,
          trashSizeMB: 0.5,
          quotaMB: 2048,
          sharedWithTrash: true,
        },
      }),
    );
    expect(mocks.pool.query.mock.calls[0][1]).toEqual(['user-1']);
  });
  it.each(['usage', 'quota'])('任一读取失败返回原有错误响应：%s', async (failing) => {
    mocks.pool.query.mockImplementation(() =>
      failing === 'usage' ? Promise.reject(new Error('fixture')) : Promise.resolve([[]]),
    );
    mocks.getUserSpaceMb.mockImplementation(() =>
      failing === 'quota' ? Promise.reject(new Error('fixture')) : Promise.resolve(1024),
    );
    const res = response();
    await mocks.routes.get('/queryTotalFileSize').at(-1)(request(), res);
    expect(res.send).toHaveBeenCalledWith({ status: 500, data: null, msg: '服务器暂时无法处理，请稍后重试' });
  });
});

describe('文件名检查复用完整名称查询', () => {
  beforeEach(() => mocks.pool.query.mockReset());
  it('保留精确大小写、重复输入和完整名称顺序', async () => {
    mocks.pool.query.mockResolvedValueOnce([
      [{ file_name: 'File.txt' }, { file_name: '文件.png' }, { file_name: 'File.txt' }],
    ]);
    const req = request();
    req.body = { fileNames: ['File.txt', 'file.txt', '文件.png', 'File.txt', 'missing'] };
    const res = response();
    await mocks.routes.get('/checkFileNames').at(-1)(req, res);
    expect(mocks.pool.query).toHaveBeenCalledTimes(1);
    expect(mocks.pool.query.mock.calls[0][1]).toEqual(['user-1']);
    expect(res.send).toHaveBeenCalledWith({
      status: 200,
      msg: '',
      data: {
        check: req.body.fileNames.map((fileName, index) => ({ fileName, exists: [0, 2, 3].includes(index) })),
        allNames: ['File.txt', '文件.png', 'File.txt'],
      },
    });
  });
  it.each([[], null, 'name'])('空或非数组输入保持空数组响应：%j', async (fileNames) => {
    const req = request();
    req.body = { fileNames };
    const res = response();
    await mocks.routes.get('/checkFileNames').at(-1)(req, res);
    expect(mocks.pool.query).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({ status: 200, msg: '', data: [] });
  });
  it('混合类型仍保留原有两次查询和严格匹配', async () => {
    mocks.pool.query.mockResolvedValueOnce([[{ file_name: '1' }]]).mockResolvedValueOnce([[{ file_name: '1' }]]);
    const req = request();
    req.body = { fileNames: [1] };
    const res = response();
    await mocks.routes.get('/checkFileNames').at(-1)(req, res);
    expect(mocks.pool.query).toHaveBeenCalledTimes(2);
    expect(mocks.pool.query.mock.calls[0][1]).toEqual(['user-1', 1]);
    expect(res.send.mock.calls[0][0].data.check).toEqual([{ fileName: 1, exists: false }]);
  });
  it('查询失败保留原错误响应', async () => {
    mocks.pool.query.mockRejectedValueOnce(new Error('fixture'));
    const req = request();
    req.body = { fileNames: ['name'] };
    const res = response();
    await mocks.routes.get('/checkFileNames').at(-1)(req, res);
    expect(res.send).toHaveBeenCalledWith({ status: 500, data: null, msg: '检查文件名失败，请稍后重试' });
  });
});

describe('云空间待整理列表', () => {
  it('分页数据和总数使用同一待整理、目录、类型及搜索范围', async () => {
    mocks.pool.query.mockReset();
    mocks.pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
    const res = response();
    await mocks.routes.get('/queryFiles').at(-1)(
      {
        user: { id: 'user-1' },
        body: {
          currentPage: 1,
          pageSize: 48,
          filters: { pendingOnly: true, folderId: 'folder-1', fileName: 'report', category: ['pdf'] },
        },
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    for (const [sql, params] of mocks.pool.query.mock.calls) {
      expect(sql).toContain('pending.user_id = files.create_by');
      expect(sql).toContain("pending.resource_type = 'file'");
      expect(sql).toContain("pending.status = 'pending'");
      expect(params.slice(0, 4)).toEqual(['user-1', 'folder-1', '%report%', 'pdf']);
    }
  });
});

describe('云文件置顶', () => {
  beforeEach(() => mocks.pool.query.mockReset());
  it.each([true, false])('保存明确状态 %s 并限制 owner 和未删除文件', async (isTop) => {
    mocks.pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await mocks.routes.get('/setFilePin').at(-1)({ user: { id: 'owner' }, body: { id: '17', isTop } }, res);
    expect(mocks.pool.query).toHaveBeenCalledWith(
      'UPDATE files SET is_top = ? WHERE id = ? AND create_by = ? AND del_flag = 0',
      [isTop ? 1 : 0, '17', 'owner'],
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200, data: { id: '17', isTop } }));
  });
  it.each([
    { id: '1', isTop: 'false' },
    { id: '1', isTop: 1 },
    { id: '../2', isTop: true },
    { id: 0, isTop: true },
  ])('拒绝非法参数 %j', async (body) => {
    const res = response();
    await mocks.routes.get('/setFilePin').at(-1)({ user: { id: 'owner' }, body }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(mocks.pool.query).not.toHaveBeenCalled();
  });
  it('重复请求保持成功，越权和已删除文件统一返回不存在', async () => {
    for (const exists of [true, false]) {
      mocks.pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([exists ? [{ id: 17 }] : []]);
      const res = response();
      await mocks.routes.get('/setFilePin').at(-1)({ user: { id: 'owner' }, body: { id: 17, isTop: true } }, res);
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: exists ? 200 : 404 }));
    }
  });
  it('数据库失败不报告成功', async () => {
    mocks.pool.query.mockRejectedValueOnce(new Error('unavailable'));
    const res = response();
    await mocks.routes.get('/setFilePin').at(-1)({ user: { id: 'owner' }, body: { id: 17, isTop: true } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
  });
});

it('文件分页响应返回持久置顶状态，置顶排序发生在 LIMIT 之前', async () => {
  mocks.pool.query.mockReset();
  mocks.pool.query
    .mockResolvedValueOnce([
      [
        { id: 17, file_name: 'pinned.zip', is_top: 1 },
        { id: 18, file_name: 'normal.zip', is_top: 0 },
      ],
    ])
    .mockResolvedValueOnce([[{ total: 2 }]]);
  const res = response();
  await mocks.routes.get('/queryFiles').at(-1)({ user: { id: 'owner' }, body: { currentPage: 1, pageSize: 48 } }, res);
  expect(res.send).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 200,
      data: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: 17, isTop: true }),
          expect.objectContaining({ id: 18, isTop: false }),
        ]),
      }),
    }),
  );
  expect(mocks.pool.query.mock.calls[0][0]).toMatch(
    /ORDER BY files.is_top DESC, files.create_time DESC, files.id DESC LIMIT \? OFFSET \?/,
  );
});

describe('legacy upload namespace and connection lifetime', () => {
  beforeEach(() => vi.clearAllMocks());
  const invalidNames = [
    'renamed/5d14916a-335b-4cfe-960e-c45571a5a8a0.pdf',
    'uploads/5d14916a-335b-4cfe-960e-c45571a5a8a0.pdf',
    '../other/file.pdf',
    'folder\\file.pdf',
    '.',
    '..',
    'bad\nname',
    'bad\u0000name',
    'bad\u007fname',
    '<file>',
    'a'.repeat(256),
  ];
  it.each(['/uploadFiles', '/confirmUpload'])(
    'rejects path-shaped names without OBS or database access: %s',
    async (route) => {
      const req = request();
      req.body.files = invalidNames.map((fileName) => ({ fileName, fileSize: 1024 * 1024 * 1024 }));
      const res = response();
      await mocks.routes.get(route).at(-1)(req, res);
      const responseBody = res.send.mock.calls[0][0];
      expect(responseBody.status).toBe(200);
      expect(responseBody.data).toHaveLength(invalidNames.length);
      expect(responseBody.data.every((item) => item.status === '处理失败' && item.error && !item.uploadUrl)).toBe(true);
      expect(mocks.createUploadSignedUrl).not.toHaveBeenCalled();
      expect(mocks.getObjectMetadataFromObs).not.toHaveBeenCalled();
      expect(mocks.pool.getConnection).not.toHaveBeenCalled();
      expect(mocks.pool.query).not.toHaveBeenCalled();
    },
  );
  it('preserves normal Unicode, literal percent signs, dots and filename aliases', async () => {
    const names = ['中文 报告 (1).PDF', '.env', 'a%2Fb.pdf', 'a#b?.txt', 'e\u0301.pdf'];
    const req = request();
    req.body.files = names.map((filename) => ({ filename, fileSize: 0 }));
    const res = response();
    await mocks.routes.get('/uploadFiles').at(-1)(req, res);
    expect(res.send.mock.calls[0][0].data.map((item) => item.filename)).toEqual(names);
    expect(mocks.createUploadSignedUrl.mock.calls.map(([params]) => params.objectKey)).toEqual(
      names.map((name) => `files/user-1/${name}`),
    );
  });
  it('does not reserve a SQL connection while OBS metadata is pending or fails', async () => {
    let failMetadata;
    mocks.getObjectMetadataFromObs.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failMetadata = reject;
        }),
    );
    const req = request(),
      res = response();
    const pending = mocks.routes.get('/confirmUpload').at(-1)(req, res);
    await vi.waitFor(() => expect(failMetadata).toBeTypeOf('function'));
    expect(mocks.pool.getConnection).not.toHaveBeenCalled();
    failMetadata(new Error('metadata unavailable'));
    await pending;
    expect(mocks.pool.getConnection).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
  });
  it('preserves mixed batch success and only confirms valid display names', async () => {
    mocks.getObjectMetadataFromObs.mockResolvedValue({ contentLength: 0 });
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT')) return [[]];
        return [{ insertId: 42, affectedRows: 1 }];
      }),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    const req = request();
    req.suppressUserRewards = true;
    req.body.files = [{ fileName: 'renamed/forbidden.pdf' }, { fileName: 'valid.pdf', fileType: 'application/pdf' }];
    const res = response();
    await mocks.routes.get('/confirmUpload').at(-1)(req, res);
    expect(mocks.getObjectMetadataFromObs).toHaveBeenCalledExactlyOnceWith('files/user-1/valid.pdf');
    expect(res.send.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ status: '处理失败' }),
      { filename: 'valid.pdf', status: '已上传', fileId: 42 },
    ]);
    expect(connection.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO files SET ?')).toHaveLength(1);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});

describe('upload routes with the real lifecycle service', () => {
  let connection, journal;
  const call = async (path, body) => {
    const res = response();
    await mocks.routes.get(path).at(-1)({ user: { id: 'user-1', role: 'user' }, suppressUserRewards: true, body }, res);
    return res.send.mock.calls[0][0];
  };
  const metadata = { fileName: 'report.pdf', fileType: 'application/pdf', fileSize: 12 };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realLifecycle = true;
    journal = new Map();
    mocks.getUserSpaceMb.mockResolvedValue(1024);
    mocks.getObjectMetadataFromObs.mockResolvedValue({ contentLength: 12 });
    mocks.createUploadSignedUrl.mockImplementation(({ objectKey }) => ({
      url: `https://upload.invalid/${objectKey}`,
      headers: {},
      expiresIn: 900,
    }));
    mocks.putObjectToObs.mockResolvedValue({});
    const query = vi.fn(async (sql, params = []) => {
      if (sql.startsWith('SELECT id, file_name, del_flag FROM files')) return [[]];
      if (sql.startsWith('INSERT INTO cloud_legacy')) {
        const [hash, generation, user_id, object_key] = params;
        if (!journal.has(hash))
          journal.set(hash, { object_hash: hash, generation, user_id, object_key, state: 'active', upload_key: null });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE cloud_legacy') && sql.includes('upload_key=?')) {
        const [upload_key, generation, hash] = params;
        Object.assign(journal.get(hash), { upload_key, generation });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM cloud_legacy')) return [[journal.get(params[0])].filter(Boolean)];
      if (sql.startsWith('INSERT INTO files')) return [{ insertId: 77 }];
      if (sql.includes('SUM(')) return [[{ used: 0 }]];
      if (sql.startsWith('SELECT id,role,del_flag FROM user')) return [[{ id: params[0], role: 'user', del_flag: 0 }]];
      return [[]];
    });
    connection = { query, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mocks.pool.query.mockImplementation(query);
    mocks.pool.getConnection.mockResolvedValue(connection);
  });
  afterEach(() => {
    mocks.realLifecycle = false;
    vi.unstubAllEnvs();
  });
  it('persists the signed random key through explicit and old-client confirmations', async () => {
    const prepared = await call('/uploadFiles', { files: [metadata] });
    const objectKey = prepared.data[0].objectKey;
    expect(objectKey).toMatch(/^files\/user-1\/uploads\/[0-9a-f-]{36}$/);
    for (const file of [{ ...metadata, objectKey }, metadata]) {
      expect((await call('/confirmUpload', { files: [file] })).status).toBe(200);
      expect(mocks.getObjectMetadataFromObs).toHaveBeenLastCalledWith(objectKey);
      expect(connection.query).toHaveBeenCalledWith('INSERT INTO files SET ?', [
        expect.objectContaining({ obs_key: objectKey, file_name: 'report.pdf' }),
      ]);
    }
  });
  it('keeps same-name uploads bound to their own keys even when confirmation order is reversed', async () => {
    const first = (await call('/uploadFiles', { files: [metadata] })).data[0];
    const second = (await call('/uploadFiles', { files: [metadata] })).data[0];
    expect(first.objectKey).not.toBe(second.objectKey);
    for (const prepared of [second, first]) {
      expect((await call('/confirmUpload', { files: [{ ...metadata, objectKey: prepared.objectKey }] })).status).toBe(
        200,
      );
      expect(mocks.getObjectMetadataFromObs).toHaveBeenLastCalledWith(prepared.objectKey);
    }
  });
  it('rejects another account key before HEAD or file mutation', async () => {
    const result = await call('/confirmUpload', {
      files: [{ ...metadata, objectKey: 'files/other/uploads/123e4567-e89b-42d3-a456-426614174000' }],
    });
    expect(result.status).toBe(409);
    expect(mocks.getObjectMetadataFromObs).not.toHaveBeenCalled();
    expect(mocks.pool.getConnection).not.toHaveBeenCalled();
  });
  it('uploads a backup to a random key and stores the same key under an owner lock', async () => {
    vi.stubEnv('BACKUP_TOKEN', 'test-backup-only');
    const res = response();
    await mocks.routes.get('/hermesBackup').at(-1)(
      {
        headers: { 'x-backup-token': 'test-backup-only' },
        file: { path: '/tmp/lightnote-missing-backup-test-file', size: 12 },
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    const key = mocks.putObjectToObs.mock.calls[0][0];
    expect(key).toMatch(/\/uploads\/[0-9a-f-]{36}$/);
    expect(connection.query).toHaveBeenCalledWith('SELECT id,role,del_flag FROM user WHERE id=? FOR UPDATE', [
      expect.any(String),
    ]);
    expect(connection.query).toHaveBeenCalledWith('INSERT INTO files SET ?', [
      expect.objectContaining({ obs_key: key, file_name: 'hermes-backup.tar.gz' }),
    ]);
  });
});

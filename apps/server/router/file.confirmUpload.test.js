import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  routes: new Map(),
  pool: { query: vi.fn(), getConnection: vi.fn() },
  getUserSpaceMb: vi.fn(),
  awardCreate: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
  removeInboxRelations: vi.fn(),
  purgeDocumentSourcesForCloudFiles: vi.fn(),
  recordFirstOwnResource: vi.fn(),
}));

vi.mock('express', () => ({
  default: {
    Router: () => ({
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
  createUploadSignedUrl: () => ({ url: 'https://upload.example', headers: {}, expiresIn: 900 }),
  deleteObjectFromObs: mocks.deleteObjectFromObs,
  getObjectMetadataFromObs: mocks.getObjectMetadataFromObs,
  putObjectToObs: vi.fn(),
}));
vi.mock('../util/fileCategory.js', () => ({
  FILE_CATEGORY_ORDER: [],
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
    expect(connection.query).toHaveBeenCalledWith('INSERT INTO files SET ?', [
      expect.objectContaining({ file_name: 'avatar.png', obs_key: 'files/user-1/avatar.png' }),
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
        if (text.includes('SUM(file_size)')) return [[{ used: 0 }]];
        if (text.startsWith('SELECT * FROM files')) {
          return [[{ id: 5, file_name: 'avatar.png', obs_key: 'files/user-1/ai/random.png' }]];
        }
        if (text === 'INSERT INTO files SET ?') throw new Error('insert failed');
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

vi.mock('../util/imagePreview/references.js',()=>({registerCloudImage:vi.fn(),removeImageReferences:vi.fn()}));

vi.mock('../util/imagePreview/cleanup.js',()=>({deleteUnmanagedObject:(...args)=>mocks.deleteObjectFromObs(...args)}));


describe('容量接口并发读取', () => {
  beforeEach(() => {
    mocks.pool.query.mockReset();
    mocks.getUserSpaceMb.mockReset();
  });
  it('同时读取用量与配额，等待两项结果后返回', async () => {
    let finishUsage;
    mocks.pool.query.mockReturnValueOnce(new Promise((resolve) => { finishUsage = resolve; }));
    mocks.getUserSpaceMb.mockResolvedValueOnce(2048);
    const res = response();
    const done = mocks.routes.get('/queryTotalFileSize').at(-1)(request(), res);
    expect(mocks.getUserSpaceMb).toHaveBeenCalledOnce();
    expect(mocks.getUserSpaceMb).toHaveBeenCalledWith('user-1', 'user');
    await Promise.resolve();
    expect(res.send).not.toHaveBeenCalled();
    finishUsage([[{ activeBytes: 1048576, trashBytes: 524288, totalBytes: 1572864 }]]);
    await done;
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({
      status: 200,
      data: {
        totalSizeMB: 1.5, activeSizeMB: 1, trashSizeMB: 0.5, quotaMB: 2048, sharedWithTrash: true,
      },
    }));
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
    expect(res.send).toHaveBeenCalledWith({status: 500, data: null, msg: '服务器暂时无法处理，请稍后重试'});
  });
});


describe('文件名检查复用完整名称查询', () => {
  beforeEach(() => mocks.pool.query.mockReset());
  it('保留精确大小写、重复输入和完整名称顺序', async () => {
    mocks.pool.query.mockResolvedValueOnce([[{file_name: 'File.txt'}, {file_name: '文件.png'}, {file_name: 'File.txt'}]]);
    const req = request();
    req.body = {fileNames: ['File.txt', 'file.txt', '文件.png', 'File.txt', 'missing']};
    const res = response();
    await mocks.routes.get('/checkFileNames').at(-1)(req, res);
    expect(mocks.pool.query).toHaveBeenCalledTimes(1);
    expect(mocks.pool.query.mock.calls[0][1]).toEqual(['user-1']);
    expect(res.send).toHaveBeenCalledWith({status: 200, msg: '', data: {
      check: req.body.fileNames.map((fileName, index) => ({fileName, exists: [0, 2, 3].includes(index)})),
      allNames: ['File.txt', '文件.png', 'File.txt'],
    }});
  });
  it.each([[], null, 'name'])('空或非数组输入保持空数组响应：%j', async (fileNames) => {
    const req = request();req.body = {fileNames};const res = response();
    await mocks.routes.get('/checkFileNames').at(-1)(req, res);
    expect(mocks.pool.query).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({status: 200, msg: '', data: []});
  });
  it('混合类型仍保留原有两次查询和严格匹配', async () => {
    mocks.pool.query.mockResolvedValueOnce([[{file_name: '1'}]]).mockResolvedValueOnce([[{file_name: '1'}]]);
    const req = request();req.body = {fileNames: [1]};const res = response();
    await mocks.routes.get('/checkFileNames').at(-1)(req, res);
    expect(mocks.pool.query).toHaveBeenCalledTimes(2);
    expect(mocks.pool.query.mock.calls[0][1]).toEqual(['user-1', 1]);
    expect(res.send.mock.calls[0][0].data.check).toEqual([{fileName: 1, exists: false}]);
  });
  it('查询失败保留原错误响应', async () => {
    mocks.pool.query.mockRejectedValueOnce(new Error('fixture'));
    const req = request();req.body = {fileNames: ['name']};const res = response();
    await mocks.routes.get('/checkFileNames').at(-1)(req, res);
    expect(res.send).toHaveBeenCalledWith({status: 500, data: null, msg: '检查文件名失败，请稍后重试'});
  });
});

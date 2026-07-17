import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  routes: new Map(),
  pool: { query: vi.fn(), getConnection: vi.fn() },
  getUserSpaceMb: vi.fn(),
  awardCreate: vi.fn(),
  deleteObjectFromObs: vi.fn(),
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
  associateFile: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
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
    mocks.getUserSpaceMb.mockResolvedValue(512);
    mocks.awardCreate.mockResolvedValue({});
    mocks.deleteObjectFromObs.mockResolvedValue({});
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
});

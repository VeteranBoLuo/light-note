import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../util/imagePreview/references.js', () => ({
  registerCloudImage: vi.fn(),
  removeImageReferences: vi.fn(),
  syncCloudImageById: vi.fn(),
}));

await import('./file.js');
const { cleanupLegacyCloudObject } = await import('../util/services/cloudLegacyObjectLifecycle.js');
const { deleteUnmanagedObject } = await import('../util/imagePreview/cleanup.js');
const { abortManagedCloudUpload, confirmManagedCloudUpload } =
  await import('../util/services/managedCloudUploadService.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `upload_integrity_${randomUUID().replaceAll('-', '')}`;
let admin, db;
const key = () => `files/user-1/uploads/${randomUUID()}`;
async function confirm(objectKey, fileName = 'report.pdf', folderId = null) {
  let result;
  await mocks.routes.get('/confirmUpload').at(-1)(
    {
      user: { id: 'user-1', role: 'user' },
      suppressUserRewards: true,
      body: { files: [{ objectKey, fileName, fileType: 'application/pdf' }], folderId },
    },
    {
      send: (value) => {
        result = value;
      },
    },
  );
  return result;
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!socketPath)('ordinary upload integrity with real MySQL transactions', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//u.test(socketPath)) throw Error('Disposable local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema}`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 8 });
    await db.query(
      'CREATE TABLE user (id VARCHAR(255) PRIMARY KEY, role VARCHAR(20), del_flag INT DEFAULT 0) ENGINE=InnoDB',
    );
    await db.query("INSERT INTO user VALUES ('user-1','user',0),('other','user',0)");
    await db.query(
      'CREATE TABLE folders (id INT PRIMARY KEY, create_by VARCHAR(255), name VARCHAR(255), del_flag INT DEFAULT 0) ENGINE=InnoDB',
    );
    await db.query(
      "INSERT INTO folders VALUES (1,'user-1','owned',0),(2,'other','private',0),(3,'user-1','trashed',1)",
    );
    await db.query(`CREATE TABLE files (
      id INT PRIMARY KEY AUTO_INCREMENT, create_by VARCHAR(255), file_name VARCHAR(255),
      file_type VARCHAR(255), file_size BIGINT, directory VARCHAR(255), folder_id INT,
      del_flag INT DEFAULT 0, obs_key VARCHAR(500), is_top INT DEFAULT 0, create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
      KEY owner_key(create_by,obs_key(150))
    ) ENGINE=InnoDB`);
    await db.query(
      'CREATE TABLE file_shares (id INT PRIMARY KEY, file_id INT, FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE image_assets (id INT PRIMARY KEY, storage_kind VARCHAR(20), source_locator VARCHAR(500)) ENGINE=InnoDB',
    );
    await db.query('CREATE TABLE tag (id INT PRIMARY KEY, name VARCHAR(255), del_flag INT DEFAULT 0) ENGINE=InnoDB');
    await db.query(
      'CREATE TABLE resource_tag_relations (tag_id INT, resource_type VARCHAR(20), resource_id INT) ENGINE=InnoDB',
    );
    const migration = await readFile(
      new URL('../migrations/20260925_cloud_legacy_object_lifecycle.sql', import.meta.url),
      'utf8',
    );
    await db.query(migration);
    mocks.pool.query.mockImplementation((...args) => db.query(...args));
    mocks.pool.getConnection.mockImplementation(() => db.getConnection());
  });
  beforeEach(async () => {
    await db.query('DELETE FROM file_shares');
    await db.query('DELETE FROM files');
    await db.query('DELETE FROM image_assets');
    await db.query('DELETE FROM cloud_legacy_object_lifecycle');
    mocks.getObjectMetadataFromObs.mockReset().mockResolvedValue({ contentLength: 12 });
    mocks.deleteObjectFromObs.mockReset().mockResolvedValue({});
    mocks.getUserSpaceMb.mockResolvedValue(1024);
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });
  it.each([2, 3, 999])('rejects foreign/deleted/missing folder %s without inserting a file', async (folderId) => {
    expect((await confirm(key(), 'report.pdf', folderId)).status).toBe(404);
    expect((await db.query('SELECT * FROM files'))[0]).toHaveLength(0);
  });
  it('does not disclose foreign or deleted folder names through historical invalid associations', async () => {
    await db.query(
      "INSERT INTO files (create_by,file_name,file_type,file_size,folder_id) VALUES ('user-1','foreign.pdf','application/pdf',12,2),('user-1','deleted.pdf','application/pdf',12,3)",
    );
    let result;
    await mocks.routes.get('/queryFiles').at(-1)(
      { user: { id: 'user-1', role: 'user' }, body: { filters: {} } },
      {
        send: (value) => {
          result = value;
        },
      },
    );
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(2);
    expect(result.data.every((file) => file.folderName === null)).toBe(true);
  });
  it('keeps legacy objects referenced by files without an explicit object key', async () => {
    await db.query(
      "INSERT INTO files (create_by,file_name,file_size,obs_key,del_flag) VALUES ('user-1','legacy.pdf',12,NULL,1)",
    );
    await deleteUnmanagedObject('files/user-1/legacy.pdf');
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });
  it('accepts owned folders and keeps identity, pin and shares on retry and replacement', async () => {
    const objectKey = key();
    const first = await confirm(objectKey, 'report.pdf', 1);
    expect(first.status).toBe(200);
    const id = first.data[0].fileId;
    await db.query('INSERT INTO file_shares VALUES (1,?)', [id]);
    await db.query('UPDATE files SET is_top=1 WHERE id=?', [id]);
    const retry = await confirm(objectKey, 'report.pdf', 1);
    expect(retry.data[0]).toMatchObject({ fileId: id, alreadyConfirmed: true });
    const replacement = await confirm(key(), 'report.pdf', 1);
    expect(replacement.data[0]).toMatchObject({ fileId: id, status: '已覆盖' });
    expect((await db.query('SELECT * FROM file_shares'))[0]).toHaveLength(1);
    expect((await db.query('SELECT * FROM files'))[0]).toEqual([
      expect.objectContaining({ id, is_top: 1, folder_id: 1 }),
    ]);
  });
  it('reusing a key under another name returns the existing file and does not duplicate it', async () => {
    const objectKey = key();
    const first = await confirm(objectKey, 'a.pdf');
    const again = await confirm(objectKey, 'b.pdf');
    expect(again.data[0]).toMatchObject({ fileId: first.data[0].fileId, filename: 'a.pdf', alreadyConfirmed: true });
    expect((await db.query('SELECT * FROM files'))[0]).toHaveLength(1);
  });
  it.each([0, 1])('preserves objects with another historical file reference, del_flag=%s', async (delFlag) => {
    const objectKey = key();
    await confirm(objectKey, 'a.pdf');
    await db.query(
      "INSERT INTO files (create_by,file_name,file_size,obs_key,del_flag) VALUES ('user-1','b.pdf',12,?,?)",
      [objectKey, delFlag],
    );
    expect((await confirm(key(), 'a.pdf')).status).toBe(200);
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });
  it('does not resurrect a trashed upload on confirmation retry', async () => {
    const objectKey = key();
    await confirm(objectKey);
    await db.query('UPDATE files SET del_flag=1');
    expect((await confirm(objectKey)).status).toBe(409);
    expect((await db.query('SELECT del_flag FROM files'))[0]).toEqual([{ del_flag: 1 }]);
  });
  it('never trusts client-supplied confirmation state to skip publication or quota checks', async () => {
    let result;
    await mocks.routes.get('/confirmUpload').at(-1)(
      {
        user: { id: 'user-1', role: 'user' },
        suppressUserRewards: true,
        body: { files: [{ objectKey: key(), fileName: 'report.pdf', confirmed: { id: 999, file_name: 'forged' } }] },
      },
      {
        send: (value) => {
          result = value;
        },
      },
    );
    expect(result.status).toBe(200);
    expect(result.data[0].alreadyConfirmed).toBeUndefined();
    expect((await db.query('SELECT * FROM files'))[0]).toHaveLength(1);
  });
  it('rejects duplicate object identities in one batch before any write', async () => {
    const objectKey = key();
    let result;
    await mocks.routes.get('/confirmUpload').at(-1)(
      {
        user: { id: 'user-1', role: 'user' },
        suppressUserRewards: true,
        body: {
          files: [
            { objectKey, fileName: 'a.pdf' },
            { objectKey, fileName: 'b.pdf' },
          ],
        },
      },
      {
        send: (value) => {
          result = value;
        },
      },
    );
    expect(result.status).toBe(400);
    expect((await db.query('SELECT * FROM files'))[0]).toHaveLength(0);
  });
  it('concurrent confirmations publish once with the same ID', async () => {
    const objectKey = key();
    const results = await Promise.all([confirm(objectKey), confirm(objectKey)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].data[0].fileId).toBe(results[1].data[0].fileId);
    expect((await db.query('SELECT * FROM files'))[0]).toHaveLength(1);
  });
  it('a successful stale HEAD cannot publish after cleanup has claimed the object', async () => {
    const objectKey = key(),
      entered = deferred(),
      resume = deferred();
    mocks.getObjectMetadataFromObs.mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return { contentLength: 12 };
    });
    const pending = confirm(objectKey);
    await entered.promise;
    await deleteUnmanagedObject(objectKey);
    resume.resolve();
    expect((await pending).status).toBe(409);
    expect((await db.query('SELECT * FROM files'))[0]).toHaveLength(0);
    expect(mocks.deleteObjectFromObs).toHaveBeenCalledWith(objectKey);
  });
  it('failed remote deletion keeps a retryable tombstone and rejects new publication', async () => {
    const objectKey = key();
    mocks.deleteObjectFromObs.mockRejectedValueOnce(new Error('OBS unavailable'));
    await expect(deleteUnmanagedObject(objectKey)).rejects.toThrow('OBS unavailable');
    expect((await db.query('SELECT state,available_at FROM cloud_legacy_object_lifecycle'))[0][0]).toMatchObject({
      state: 'deleting',
      available_at: expect.any(Date),
    });
    expect((await confirm(objectKey)).status).toBe(409);
  });
  it('the worker retries failed random-object cleanup outside the claiming transaction', async () => {
    const objectKey = key();
    mocks.deleteObjectFromObs.mockRejectedValueOnce(new Error('temporary'));
    await expect(deleteUnmanagedObject(objectKey)).rejects.toThrow('temporary');
    await db.query('UPDATE cloud_legacy_object_lifecycle SET available_at=NOW()');
    const remove = vi.fn(async () => {
      expect((await confirm(objectKey)).status).toBe(409);
    });
    expect(await cleanupLegacyCloudObject({ database: db, remove, env: { LIGHTNOTE_RUNTIME_ENV: 'test' } })).toBe(true);
    expect(remove).toHaveBeenCalledWith(objectKey);
    expect((await db.query('SELECT state FROM cloud_legacy_object_lifecycle'))[0]).toEqual([{ state: 'retired' }]);
  });
  it('publication winning first protects the object from later cleanup', async () => {
    const objectKey = key();
    expect((await confirm(objectKey)).status).toBe(200);
    await deleteUnmanagedObject(objectKey);
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });
  it('image assets protect an object even without a cloud file row', async () => {
    const objectKey = key();
    await db.query("INSERT INTO image_assets VALUES (1,'obs',?)", [objectKey]);
    await deleteUnmanagedObject(objectKey);
    expect(mocks.deleteObjectFromObs).not.toHaveBeenCalled();
  });
  it('retry keeps a renamed file and succeeds after the original target folder is unavailable', async () => {
    const objectKey = key();
    const first = await confirm(objectKey, 'original.pdf', 1);
    await db.query("UPDATE files SET file_name='renamed.pdf',folder_id=NULL");
    const retry = await confirm(objectKey, 'original.pdf', 999);
    expect(retry.status).toBe(200);
    expect(retry.data[0]).toMatchObject({
      fileId: first.data[0].fileId,
      filename: 'renamed.pdf',
      alreadyConfirmed: true,
    });
  });
  it('managed abort and ordinary confirmation share the durable deletion boundary', async () => {
    const objectKey = key();
    await abortManagedCloudUpload({ userId: 'user-1', objectKey });
    expect((await confirm(objectKey)).status).toBe(409);
  });
  it('managed confirmation cannot republish a retired ordinary upload', async () => {
    const objectKey = key();
    await deleteUnmanagedObject(objectKey);
    await expect(
      confirmManagedCloudUpload({ userId: 'user-1', userRole: 'user', objectKey, fileName: 'report.pdf' }),
    ).rejects.toMatchObject({ code: 'UPLOAD_OBJECT_RETIRED' });
  });
});

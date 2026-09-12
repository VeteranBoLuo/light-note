import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Explicit disposable local database only. OBS and post-create effects are controlled substitutes.
const state = vi.hoisted(() => ({ db: null, head: vi.fn(), remove: vi.fn(), quota: 1 }));
vi.mock('../../db/index.js', () => ({ default: {
  query: (...args) => state.db.query(...args),
  getConnection: (...args) => state.db.getConnection(...args),
} }));
vi.mock('../growth.js', () => ({ getUserSpaceMb: async () => state.quota }));
vi.mock('../obsClient.js', () => ({
  bucketBaseUrl: 'https://example.invalid', createUploadSignedUrl: vi.fn(),
  getObjectMetadataFromObs: (...args) => state.head(...args),
  deleteObjectFromObs: (...args) => state.remove(...args),
}));
vi.mock('../imagePreview/references.js', () => ({ syncCloudImageById: async () => {} }));
vi.mock('../resourceInbox.js', () => ({ enqueueResources: async () => {} }));
vi.mock('./resourceCreateEffects.js', () => ({ triggerResourceCreateEffects: async () => {} }));
const { confirmManagedCloudUpload, abortManagedCloudUpload, insertVerifiedCloudFile } = await import('./managedCloudUploadService.js');
const socketPath = process.env.Q01_TEST_MYSQL_SOCKET;
const schema = `q01_upload_${randomUUID().replaceAll('-', '')}`;
let admin;
let created = false;
const upload = (owner = 'one') => ({
  userId: owner, objectKey: `files/${owner}/uploads/${randomUUID()}.pdf`,
  fileName: '资料.pdf', fileType: 'application/pdf',
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe.skipIf(!socketPath)('托管上传真实 MySQL 并发', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    state.db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 6 });
    await state.db.query('CREATE TABLE user (id VARCHAR(32) PRIMARY KEY) ENGINE=InnoDB');
    await state.db.query("INSERT INTO user VALUES ('one'), ('two')");
    await state.db.query(`CREATE TABLE files (
      id BIGINT PRIMARY KEY AUTO_INCREMENT, create_by VARCHAR(32), file_name VARCHAR(255),
      file_type VARCHAR(255), file_size BIGINT, directory VARCHAR(255), folder_id BIGINT,
      del_flag INT DEFAULT 0, obs_key VARCHAR(255), KEY owner_key(create_by,obs_key),
      KEY owner_name(create_by,file_name)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  });
  beforeEach(async () => {
    await state.db.query('DELETE FROM files');
    state.quota = 1;
    state.head.mockReset().mockResolvedValue({ contentLength: 700000 });
    state.remove.mockReset().mockResolvedValue({});
  });
  afterAll(async () => {
    await state.db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  it('三个并发确认同一对象只保存一次、只读取一次对象元数据', async () => {
    const item = upload();
    const results = await Promise.all(Array.from({ length: 3 }, () => confirmManagedCloudUpload(item)));
    expect(new Set(results.map((r) => r.fileId)).size).toBe(1);
    expect(results.filter((r) => !r.alreadyConfirmed)).toHaveLength(1);
    expect(state.head).toHaveBeenCalledTimes(1);
    expect((await state.db.query('SELECT COUNT(*) AS n FROM files'))[0][0].n).toBe(1);
  });
  it('两个文件同时确认时重新计算容量，不会一起突破剩余配额', async () => {
    const results = await Promise.allSettled([confirmManagedCloudUpload(upload()), confirmManagedCloudUpload(upload())]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(Number((await state.db.query('SELECT SUM(file_size) AS bytes FROM files'))[0][0].bytes)).toBe(700000);
    expect(state.remove).toHaveBeenCalledTimes(1);
  });
  it('同名分批查询保留数据库大小写、重音、回收站占名和账号隔离规则', async () => {
    await state.db.query(`INSERT INTO files (create_by,file_name,file_size,del_flag) VALUES
      ('one','Résumé.pdf',100,1), ('one','RESUME (1).pdf',100,0),
      ('one','resume (2).pdf',100,2), ('two','resume (2).pdf',100,0)`);
    const result = await confirmManagedCloudUpload({ ...upload(), fileName: 'resume.pdf' });
    expect(result.filename).toBe('resume (2).pdf');
    const [rows] = await state.db.query('SELECT file_name FROM files WHERE id = ?', [result.fileId]);
    expect(rows[0].file_name).toBe('resume (2).pdf');
  });
  it('慢对象读取阻塞同账号确认，但其他账号仍能完成', async () => {
    state.quota = 10;
    const gate = deferred();
    const entered = deferred();
    const firstItem = upload();
    state.head.mockImplementation(async (key) => {
      if (key === firstItem.objectKey) { entered.resolve(); await gate.promise; }
      return { contentLength: 100 };
    });
    const first = confirmManagedCloudUpload(firstItem);
    let second;
    try {
      await entered.promise;
      let secondDone = false;
      second = confirmManagedCloudUpload(upload()).then((result) => { secondDone = true; return result; });
      const other = await confirmManagedCloudUpload(upload('two'));
      expect(other.fileId).toBeTruthy();
      expect(secondDone).toBe(false);
      expect(state.head).toHaveBeenCalledTimes(2);
    } finally {
      gate.resolve();
      await Promise.allSettled([first, second].filter(Boolean));
    }
    expect((await state.db.query('SELECT COUNT(*) AS n FROM files'))[0][0].n).toBe(3);
  });
  it('确认读取对象期间取消快速拒绝，确认完成后重试保留对象', async () => {
    const gate = deferred();
    const entered = deferred();
    const item = upload();
    state.head.mockImplementation(async () => { entered.resolve(); await gate.promise; return { contentLength: 100 }; });
    const confirming = confirmManagedCloudUpload(item);
    try {
      await entered.promise;
      await expect(abortManagedCloudUpload(item)).rejects.toMatchObject({ code: 'UPLOAD_BUSY' });
    } finally { gate.resolve(); }
    const confirmed = await confirming;
    expect(await abortManagedCloudUpload(item)).toMatchObject({ deleted: false, alreadyConfirmed: true, fileId: confirmed.fileId });
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('慢删除期间同账号其他文件可确认，原对象与维护插入均不能落库', async () => {
    const gate = deferred(), entered = deferred();
    const item = upload();
    state.remove.mockImplementation(async () => { entered.resolve(); await gate.promise; });
    const aborting = abortManagedCloudUpload(item);
    try {
      await entered.promise;
      const other = await confirmManagedCloudUpload(upload());
      expect(other.fileId).toBeTruthy();
      await expect(confirmManagedCloudUpload(item)).rejects.toMatchObject({ code: 'UPLOAD_BUSY' });
      const connection = await state.db.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query('SELECT id FROM user WHERE id = ? FOR UPDATE', [item.userId]);
        await expect(insertVerifiedCloudFile(connection, { ...item, quotaMB: 10 })).rejects.toMatchObject({ code: 'UPLOAD_BUSY' });
      } finally { await connection.rollback(); connection.release(); }
    } finally { gate.resolve(); await aborting; }
    expect((await state.db.query('SELECT COUNT(*) AS n FROM files'))[0][0].n).toBe(1);
  });
  it('取消已进入删除时，并发确认不能用已删除对象创建记录', async () => {
    const gate = deferred();
    const entered = deferred();
    const item = upload();
    let deleted = false;
    state.remove.mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      deleted = true;
    });
    state.head.mockImplementation(async () => {
      if (deleted) throw new Error('Object missing');
      return { contentLength: 100 };
    });
    const aborting = abortManagedCloudUpload(item);
    let confirming;
    try {
      await entered.promise;
      // Attach rejection handling immediately; deletion wins before metadata can be read.
      confirming = Promise.allSettled([confirmManagedCloudUpload(item)]);
    } finally {
      gate.resolve();
    }
    expect(await aborting).toMatchObject({ deleted: true, alreadyConfirmed: false });
    expect((await confirming)[0].status).toBe('rejected');
    expect((await state.db.query('SELECT COUNT(*) AS n FROM files'))[0][0].n).toBe(0);
  });
});

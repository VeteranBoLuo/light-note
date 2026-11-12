import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_DIRECT_MAX_BYTES,
  CLOUD_UPLOAD_MAX_BYTES,
  CLOUD_UPLOAD_PART_BYTES,
} from '@lightnote/shared/cloud-upload';
import { createCloudMultipartService } from './cloudMultipartUploadService.js';
import { lockActiveUploadOwner } from './cloudLegacyObjectLifecycle.js';
import { lockCloudObjectForPublication } from './cloudObjectPublication.js';

const socket = process.env.Q01_TEST_MYSQL_SOCKET;
const schema = `multipart_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socket)('大文件会话：隔离 MySQL 与受控 OBS', () => {
  let admin, db, service, obs, uploads, objects, removed, quotaMB;
  const size = CLOUD_DIRECT_MAX_BYTES + 123;
  const init = (data = {}) =>
    service.initialize({
      userId: 'owner',
      userRole: 'user',
      requestId: randomUUID(),
      fileName: 'backup.zip',
      fileType: 'application/zip',
      fileSize: size,
      folderId: 7,
      ...data,
    });
  const row = async (id) => (await db.query('SELECT * FROM cloud_multipart_uploads WHERE id=?', [id]))[0][0];
  const fill = (session) => {
    const item = uploads.get(session.objectKey);
    item.parts = Array.from({ length: session.partCount }, (_, i) => ({
      PartNumber: i + 1,
      ETag: `"part-${i + 1}"`,
      Size: Math.min(CLOUD_UPLOAD_PART_BYTES, session.fileSize - i * CLOUD_UPLOAD_PART_BYTES),
    }));
  };
  const confirm = async (s) => {
    const c = await db.getConnection();
    try {
      await c.beginTransaction();
      await lockActiveUploadOwner(c, 'owner');
      await service.lockForPublication(c, 'owner', s.sessionId);
      await lockCloudObjectForPublication(c, 'owner', s.objectKey);
      const [r] = await c.query("INSERT INTO files (create_by,file_name,file_size,obs_key) VALUES ('owner',?,?,?)", [
        s.filename,
        s.fileSize,
        s.objectKey,
      ]);
      await service.markConfirmed(c, 'owner', s.sessionId, r.insertId);
      await c.commit();
      return r.insertId;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  };
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    expect(Number((await admin.query('SELECT @@skip_networking AS isolated'))[0][0].isolated)).toBe(1);
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = mysql.createPool({
      socketPath: socket,
      user: 'root',
      database: schema,
      connectionLimit: 8,
      multipleStatements: true,
    });
    for (const file of ['20261102_cloud_multipart_uploads.sql', '20260925_cloud_legacy_object_lifecycle.sql']) {
      const ddl = await readFile(new URL('../../migrations/' + file, import.meta.url), 'utf8');
      await db.query(ddl);
      await db.query(ddl);
    }
    await db.query(`CREATE TABLE user (id VARCHAR(255) PRIMARY KEY,role VARCHAR(20) DEFAULT 'user',del_flag VARCHAR(1) DEFAULT '0');
      INSERT INTO user (id) VALUES ('owner'),('other');
      CREATE TABLE files (id BIGINT AUTO_INCREMENT PRIMARY KEY,create_by VARCHAR(255),file_name VARCHAR(255),file_size BIGINT,obs_key VARCHAR(500),del_flag INT DEFAULT 0);
      CREATE TABLE image_assets (id INT PRIMARY KEY,storage_kind VARCHAR(20),source_locator VARCHAR(500));
      CREATE TABLE folders (id INT PRIMARY KEY,create_by VARCHAR(255),del_flag INT DEFAULT 0);
      INSERT INTO folders VALUES (7,'owner',0),(8,'other',0);`);
  });
  beforeEach(async () => {
    await db.query(
      "DELETE FROM files; DELETE FROM cloud_multipart_uploads; DELETE FROM cloud_legacy_object_lifecycle; UPDATE user SET role='user',del_flag=0",
    );
    uploads = new Map();
    objects = new Map();
    removed = vi.fn(async (key) => objects.delete(key));
    quotaMB = 100000;
    obs = {
      findCloudMultipartUploads: vi.fn(async (key) =>
        uploads.has(key) ? [{ Key: key, UploadId: uploads.get(key).id }] : [],
      ),
      initiateCloudMultipart: vi.fn(async (key, sessionId) => {
        const id = randomUUID();
        uploads.set(key, { id, sessionId, parts: [] });
        return { UploadId: id };
      }),
      signCloudMultipartPart: vi.fn((key, id, partNumber) => ({
        partNumber,
        uploadUrl: 'https://parts.test/' + partNumber,
        expiresIn: 900,
      })),
      listCloudMultipartParts: vi.fn(async (key) => uploads.get(key).parts),
      headCloudMultipart: vi.fn(async (key) => objects.get(key) || null),
      completeCloudMultipart: vi.fn(async (key, id, parts) => {
        const u = uploads.get(key);
        objects.set(key, { size: parts.reduce((s, p) => s + p.Size, 0), sessionId: u.sessionId, etag: '"complete"' });
        uploads.delete(key);
        return { ETag: '"complete"' };
      }),
      abortCloudMultipart: vi.fn(async (key) => uploads.delete(key)),
    };
    service = createCloudMultipartService({ database: db, obs, quota: async () => quotaMB, remove: removed });
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });
  it('只允许 (5GiB,10GiB]；迁移幂等，10GiB 大小精确保存', async () => {
    for (const fileSize of [CLOUD_DIRECT_MAX_BYTES, CLOUD_UPLOAD_MAX_BYTES + 1, -1, NaN])
      await expect(init({ fileSize })).rejects.toMatchObject({ code: 'MULTIPART_FILE_INVALID' });
    expect(obs.initiateCloudMultipart).not.toHaveBeenCalled();
    const s = await init({ fileSize: CLOUD_UPLOAD_MAX_BYTES });
    expect(Number((await row(s.sessionId)).file_size)).toBe(CLOUD_UPLOAD_MAX_BYTES);
    expect(s.partCount).toBe(640);
  });
  it('迁移未安装时大文件能力失败关闭，不初始化 OBS 或改动普通文件', async () => {
    const unavailable = {
      query: vi.fn().mockRejectedValue(Object.assign(new Error(), { code: 'ER_NO_SUCH_TABLE' })),
      getConnection: vi.fn(),
    };
    const pending = createCloudMultipartService({ database: unavailable, obs });
    await expect(
      pending.initialize({ userId: 'owner', requestId: randomUUID(), fileSize: size }),
    ).rejects.toMatchObject({ code: 'MULTIPART_SCHEMA_NOT_READY', status: 503 });
    expect(unavailable.getConnection).not.toHaveBeenCalled();
    expect(obs.initiateCloudMultipart).not.toHaveBeenCalled();
  });
  it('初始化重放使用原任务，不能串账号、目标或大小；签名只允许本会话合法段号', async () => {
    const requestId = randomUUID();
    const s = await init({ requestId });
    const again = await init({ requestId });
    expect(again.sessionId).toBe(s.sessionId);
    expect(obs.initiateCloudMultipart).toHaveBeenCalledTimes(1);
    await expect(init({ requestId, fileSize: size + 1 })).rejects.toMatchObject({ code: 'MULTIPART_REQUEST_MISMATCH' });
    await expect(init({ folderId: 8 })).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    await expect(service.status({ userId: 'other', sessionId: s.sessionId })).rejects.toMatchObject({ status: 404 });
    for (const partNumbers of [[0], [1, 1], [641], [1, 2, 3, 4, 5, 6, 7]])
      await expect(service.signParts({ userId: 'owner', sessionId: s.sessionId, partNumbers })).rejects.toMatchObject({
        code: 'MULTIPART_PART_INVALID',
      });
    expect(await service.signParts({ userId: 'owner', sessionId: s.sessionId, partNumbers: [1, 2] })).toHaveLength(2);
  });
  it('初始化丢失响应找回原上传ID，不创建第二份', async () => {
    const original = obs.initiateCloudMultipart.getMockImplementation();
    let first = true;
    obs.initiateCloudMultipart.mockImplementation(async (...args) => {
      const r = await original(...args);
      if (first) {
        first = false;
        throw Error('lost response');
      }
      return r;
    });
    const requestId = randomUUID();
    await expect(init({ requestId })).rejects.toThrow('lost response');
    const s = await init({ requestId });
    expect(s.state).toBe('uploading');
    expect(obs.initiateCloudMultipart).toHaveBeenCalledTimes(1);
  });
  it('初始化和合并租约争用返回可重试 429，避免触发全局账号受限状态', async () => {
    const gated = (method) => {
      let entered, release;
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      const original = obs[method].getMockImplementation();
      obs[method].mockImplementation(async (...args) => {
        entered();
        await wait;
        return original(...args);
      });
      return { started, release };
    };
    const creating = gated('initiateCloudMultipart');
    const requestId = randomUUID();
    const initial = init({ requestId });
    await creating.started;
    try {
      await expect(init({ requestId })).rejects.toMatchObject({ code: 'MULTIPART_BUSY', status: 429 });
    } finally {
      creating.release();
    }
    const session = await initial;
    fill(session);
    const merging = gated('completeCloudMultipart');
    const completing = service.complete({ userId: 'owner', sessionId: session.sessionId });
    await merging.started;
    try {
      await expect(service.complete({ userId: 'owner', sessionId: session.sessionId })).rejects.toMatchObject({
        code: 'MULTIPART_BUSY',
        status: 429,
      });
    } finally {
      merging.release();
    }
    expect((await completing).state).toBe('ready');
  });
  it('分片缺失、大小不符时不合并；完成后核验对象并重复确认只返回原会话', async () => {
    const s = await init();
    await expect(service.complete({ userId: 'owner', sessionId: s.sessionId })).rejects.toMatchObject({
      code: 'MULTIPART_PARTS_INCOMPLETE',
    });
    expect((await row(s.sessionId)).state).toBe('uploading');
    fill(s);
    uploads.get(s.objectKey).parts[1].Size--;
    await expect(service.complete({ userId: 'owner', sessionId: s.sessionId })).rejects.toMatchObject({
      code: 'MULTIPART_PARTS_INCOMPLETE',
    });
    fill(s);
    expect((await service.complete({ userId: 'owner', sessionId: s.sessionId })).state).toBe('ready');
    const file = await service.reserveConfirmation({ userId: 'owner', sessionId: s.sessionId, folderId: 7 });
    await service.verifyPublication('owner', file);
    await expect(
      service.reserveConfirmation({ userId: 'owner', sessionId: s.sessionId, folderId: 8 }),
    ).rejects.toMatchObject({ code: 'MULTIPART_TARGET_MISMATCH' });
    await service.complete({ userId: 'owner', sessionId: s.sessionId });
    expect(obs.completeCloudMultipart).toHaveBeenCalledTimes(1);
    objects.get(s.objectKey).sessionId = 'wrong';
    await expect(service.verifyPublication('owner', file)).rejects.toMatchObject({ code: 'MULTIPART_OBJECT_INVALID' });
  });
  it('合并响应丢失时用对象元数据恢复，不重新上传或复制', async () => {
    const s = await init();
    fill(s);
    const original = obs.completeCloudMultipart.getMockImplementation();
    obs.completeCloudMultipart.mockImplementation(async (...args) => {
      await original(...args);
      throw Error('response lost');
    });
    expect((await service.complete({ userId: 'owner', sessionId: s.sessionId })).state).toBe('ready');
    expect(obs.completeCloudMultipart).toHaveBeenCalledTimes(1);
  });
  it('取消先提交状态，晚到的合并结果不能发布，清理完成后删除对象', async () => {
    const s = await init();
    fill(s);
    let release, started;
    const gate = new Promise((r) => {
        release = r;
      }),
      entered = new Promise((r) => {
        started = r;
      });
    const original = obs.completeCloudMultipart.getMockImplementation();
    obs.completeCloudMultipart.mockImplementation(async (...args) => {
      started();
      await gate;
      return original(...args);
    });
    const completing = service.complete({ userId: 'owner', sessionId: s.sessionId }).catch((e) => e);
    await entered;
    await service.abort({ userId: 'owner', sessionId: s.sessionId });
    release();
    expect((await completing).code).toBe('MULTIPART_SESSION_INACTIVE');
    await service.cleanup(s.sessionId);
    expect((await row(s.sessionId)).state).toBe('aborted');
    expect(objects.has(s.objectKey)).toBe(false);
    await expect(service.lockForPublication(db, 'owner', s.sessionId)).rejects.toMatchObject({
      code: 'MULTIPART_SESSION_INACTIVE',
    });
  });
  it('保存提交与取消共用账号锁，已确认文件不会被取消删除', async () => {
    const s = await init();
    fill(s);
    await service.complete({ userId: 'owner', sessionId: s.sessionId });
    const id = await confirm(s);
    expect(await service.abort({ userId: 'owner', sessionId: s.sessionId })).toEqual({
      alreadyConfirmed: true,
      fileId: id,
    });
    expect(removed).not.toHaveBeenCalled();
    expect(objects.has(s.objectKey)).toBe(true);
  });
  it('额度包含回收站，同名覆盖按差额提前检查', async () => {
    quotaMB = 6144;
    await db.query("INSERT INTO files(create_by,file_name,file_size,del_flag) VALUES ('owner','trash',?,1)", [
      1024 ** 3,
    ]);
    await expect(init()).rejects.toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED', status: 413 });
    await db.query("INSERT INTO files(create_by,file_name,file_size) VALUES ('owner','backup.zip',?)", [size]);
    quotaMB = 8192;
    expect((await init()).state).toBe('uploading');
  });
  it('会话过期或账号注销仍能回收未合并分片；删除失败保留可重试状态', async () => {
    const s = await init();
    await db.query('UPDATE cloud_multipart_uploads SET expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE id=?', [
      s.sessionId,
    ]);
    await db.query("UPDATE user SET role='deleted',del_flag=1 WHERE id='owner'");
    removed.mockRejectedValueOnce(Error('network'));
    await expect(service.cleanup(s.sessionId)).rejects.toThrow('network');
    expect((await row(s.sessionId)).state).toBe('aborting');
    await db.query('UPDATE cloud_multipart_uploads SET available_at=NOW(),lease_until=NULL WHERE id=?', [s.sessionId]);
    expect(await service.cleanup(s.sessionId)).toBe(true);
    expect((await row(s.sessionId)).state).toBe('aborted');
    expect(uploads.size).toBe(0);
  });
});

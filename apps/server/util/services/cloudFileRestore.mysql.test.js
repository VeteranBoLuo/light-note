import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null, copy: vi.fn(), remove: vi.fn() }));
vi.mock('../../db/index.js', () => ({
  default: { getConnection: (...args) => state.db.getConnection(...args), query: (...args) => state.db.query(...args) },
}));
vi.mock('../personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
vi.mock('./noteTreeService.js', () => ({ previewOwnedNoteTrashRestore: vi.fn(), restoreOwnedNoteTrash: vi.fn() }));
vi.mock('../obsClient.js', () => ({
  buildObjectKey: (user, name) => `files/${user}/${name}`,
  bucketBaseUrl: 'https://obs.invalid',
  copyObjectInObs: state.copy,
  getObjectMetadataFromObs: vi.fn().mockResolvedValue({ etag: '"version-1"' }),
  deleteObjectFromObs: state.remove,
}));
vi.mock('../imagePreview/relocate.js', () => ({ relocateCloudImage: vi.fn() }));
vi.mock('../aiDocument/service.js', () => ({ purgeDocumentSourcesForCloudFiles: vi.fn() }));
import { cleanupRenameStage } from './cloudFileRenameStaging.js';
import { relocateCloudImage } from '../imagePreview/relocate.js';
import { renameOwnedCloudFile, withPreparedCloudFileRename } from './cloudFileRenameService.js';
import { restoreTrashResources } from './trashService.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `file_restore_${randomUUID().replaceAll('-', '')}`;
let admin;
let created = false;
describe.skipIf(!socketPath)('文件恢复真实 MySQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    state.db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 4 });
    await state.db.query(
      await readFile(new URL('../../migrations/20260925_cloud_file_rename_staging.sql', import.meta.url), 'utf8'),
    );
    await state.db.query(
      await readFile(new URL('../../migrations/20260925_cloud_legacy_object_lifecycle.sql', import.meta.url), 'utf8'),
    );
    await state.db.query('CREATE TABLE user (id VARCHAR(32) PRIMARY KEY) ENGINE=InnoDB');
    await state.db.query("INSERT INTO user VALUES ('u')");
    await state.db.query(`CREATE TABLE files (id INT PRIMARY KEY, create_by VARCHAR(32), file_name VARCHAR(255),
      obs_key VARCHAR(512), del_flag INT, deleted_at DATETIME NULL,
      KEY owner_name(create_by,file_name)) ENGINE=InnoDB`);
    await state.db.query('ALTER TABLE files ADD directory VARCHAR(512) NULL');
    await state.db.query(
      'CREATE TABLE image_assets (id INT PRIMARY KEY, storage_kind VARCHAR(20), source_locator VARCHAR(512))',
    );
  });
  beforeEach(async () => {
    vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'test');
    await state.db.query('DELETE FROM cloud_file_rename_staging');
    await state.db.query('DELETE FROM cloud_legacy_object_lifecycle');
    await state.db.query('DELETE FROM files');
    await state.db.query(`INSERT INTO files (id,create_by,file_name,obs_key,del_flag,deleted_at) VALUES
      (1,'u','Plan.PNG','new',0,NULL), (2,'u','plan.png','old-two',1,NOW()),
      (3,'u','plan.png',NULL,1,NOW())`);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await state.db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  it.each([null, 'files/u/plan.png'])('重命名避让回收站原件，包括历史缺失键 %s', async (key) => {
    await state.db.query('UPDATE files SET obs_key=? WHERE id=3', [key]);
    state.copy.mockClear();
    await withPreparedCloudFileRename(async (preparation) => {
      const c = await state.db.getConnection();
      try {
        await c.beginTransaction();
        const result = await renameOwnedCloudFile(c, { userId: 'u', id: 1, name: 'plan.png', preparation });
        await c.commit();
        expect(result.name).toBe('plan.png');
      } catch (error) {
        await c.rollback();
        throw error;
      } finally {
        c.release();
      }
    });
    const [rows] = await state.db.query('SELECT * FROM files ORDER BY id');
    expect(rows[0].obs_key).toMatch(/^files\/u\/renamed\//);
    expect(state.copy).toHaveBeenCalledExactlyOnceWith('new', rows[0].obs_key, { sourceEtag: '"version-1"' });
    expect(rows[2].obs_key).toBe(key);
    expect(rows[2].del_flag).toBe(1);
  });
  it('托管上传改名不调用 OBS，且同名回收站恢复不会改变任何原件地址', async () => {
    const key = 'files/u/uploads/5d14916a-335b-4cfe-960e-c45571a5a8a0.png';
    await state.db.query('UPDATE files SET obs_key=? WHERE id=1', [key]);
    state.copy.mockClear();
    state.remove.mockClear();
    const c = await state.db.getConnection();
    try {
      await c.beginTransaction();
      await renameOwnedCloudFile(c, { userId: 'u', id: 1, name: 'plan.png' });
      await c.commit();
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
    await restoreTrashResources({ userId: 'u', filters: { type: 'file', all: true } });
    const [rows] = await state.db.query('SELECT * FROM files ORDER BY id');
    expect(rows[0]).toMatchObject({ file_name: 'plan.png', obs_key: key });
    expect(rows[1]).toMatchObject({ file_name: 'plan (1).png', obs_key: 'old-two' });
    expect(rows[2]).toMatchObject({ file_name: 'plan (2).png', obs_key: 'files/u/plan.png' });
    expect(state.copy).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('并发恢复按数据库大小写规则编号，保留新旧原件', async () => {
    const results = await Promise.all(
      ['2', '3'].map((id) =>
        restoreTrashResources({
          userId: 'u',
          filters: { type: 'file', id },
        }),
      ),
    );
    expect(results).toEqual([[{ type: 'file', count: 1 }], [{ type: 'file', count: 1 }]]);
    const [rows] = await state.db.query('SELECT * FROM files ORDER BY id');
    expect(rows[0]).toMatchObject({ file_name: 'Plan.PNG', obs_key: 'new', del_flag: 0 });
    expect(
      rows
        .slice(1)
        .map((r) => r.file_name)
        .sort(),
    ).toEqual(['plan (1).png', 'plan (2).png']);
    expect(rows[1].obs_key).toBe('old-two');
    expect(rows[2].obs_key).toBe('files/u/plan.png');
  });
  it('批量恢复在同一事务中保留已分配名称', async () => {
    await restoreTrashResources({ userId: 'u', filters: { type: 'file', all: true } });
    const [rows] = await state.db.query('SELECT file_name FROM files ORDER BY id');
    expect(rows.map((r) => r.file_name)).toEqual(['Plan.PNG', 'plan (1).png', 'plan (2).png']);
  });

  async function renameInTransactions() {
    return withPreparedCloudFileRename(async (preparation) => {
      const c = await state.db.getConnection();
      try {
        await c.beginTransaction();
        const result = await renameOwnedCloudFile(c, { userId: 'u', id: 1, name: 'renamed.png', preparation });
        await c.commit();
        return result;
      } catch (error) {
        await c.rollback();
        throw error;
      } finally {
        c.release();
      }
    });
  }

  it('releases account and file locks before the remote copy begins', async () => {
    state.copy.mockImplementationOnce(async (_source, target) => {
      const [[journal]] = await state.db.query('SELECT * FROM cloud_file_rename_staging');
      expect(journal).toMatchObject({ state: 'pending', target_key: target, file_id: 1 });
      const other = await state.db.getConnection();
      try {
        await other.query('SET SESSION innodb_lock_wait_timeout=1');
        await other.beginTransaction();
        await other.query("SELECT id FROM user WHERE id='u' FOR UPDATE");
        await other.query('SELECT id FROM files WHERE id=1 FOR UPDATE');
        await other.commit();
      } catch (error) {
        await other.rollback();
        throw error;
      } finally {
        other.release();
      }
    });
    const result = await renameInTransactions();
    expect(result.name).toBe('renamed.png');
    const [[file]] = await state.db.query('SELECT * FROM files WHERE id=1');
    expect(file.file_name).toBe('renamed.png');
    expect(file.obs_key).toMatch(/^files\/u\/renamed\//);
  });

  it('rejects a stale file snapshot after copying and only cleans the unused destination', async () => {
    state.remove.mockClear();
    let destination;
    state.copy.mockImplementationOnce(async (_source, target) => {
      destination = target;
      await state.db.query("UPDATE files SET file_name='concurrent.png' WHERE id=1");
    });
    await expect(renameInTransactions()).rejects.toMatchObject({ code: 'FILE_RENAME_CHANGED', status: 409 });
    const [[file]] = await state.db.query('SELECT * FROM files WHERE id=1');
    expect(file.file_name).toBe('concurrent.png');
    expect(file.obs_key).toBe('new');
    expect(state.remove).toHaveBeenCalledExactlyOnceWith(destination);
  });

  it('rechecks filename conflicts created while copying', async () => {
    state.copy.mockImplementationOnce(async () => {
      await state.db.query("UPDATE files SET del_flag=0,file_name='renamed.png' WHERE id=2");
    });
    await expect(renameInTransactions()).rejects.toMatchObject({ code: 'FILE_NAME_CONFLICT' });
    const [[file]] = await state.db.query('SELECT * FROM files WHERE id=1');
    expect(file.file_name).toBe('Plan.PNG');
    expect(file.obs_key).toBe('new');
  });
  it('cannot publish a copy reclaimed by a worker while the API was stalled', async () => {
    state.copy.mockImplementationOnce(async () => {
      await state.db.query('UPDATE cloud_file_rename_staging SET available_at=NOW()');
      await cleanupRenameStage({ database: state.db, remove: state.remove, env: { LIGHTNOTE_RUNTIME_ENV: 'test' } });
    });
    await expect(renameInTransactions()).rejects.toMatchObject({ code: 'FILE_RENAME_STAGE_EXPIRED' });
    const [[file]] = await state.db.query('SELECT * FROM files WHERE id=1');
    expect(file.obs_key).toBe('new');
    const [[journal]] = await state.db.query('SELECT state FROM cloud_file_rename_staging');
    expect(journal.state).toBe('deleting');
  });
  it('rolls the staged adoption back when image relocation fails', async () => {
    relocateCloudImage.mockRejectedValueOnce(
      Object.assign(new Error('asset conflict'), { code: 'FILE_IMAGE_SOURCE_CONFLICT' }),
    );
    await expect(renameInTransactions()).rejects.toMatchObject({ code: 'FILE_IMAGE_SOURCE_CONFLICT' });
    const [[file]] = await state.db.query('SELECT * FROM files WHERE id=1');
    expect(file.obs_key).toBe('new');
    const [[journal]] = await state.db.query('SELECT state FROM cloud_file_rename_staging');
    expect(journal.state).toBe('deleting');
  });
});

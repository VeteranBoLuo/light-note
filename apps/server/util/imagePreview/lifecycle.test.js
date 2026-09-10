import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import { imageSchemaStatements } from './schema.js';
import {
  registerAsset,
  registerCloudImage,
  replaceReferences,
  syncContentReferences,
  removeImageReferences,
} from './references.js';
import { resolveImagePreviews, validateResolveItems, retryImagePreview } from './service.js';
import { runSingleImagePreviewJob, cleanupImageAssets } from './worker.js';
import { hash } from './sources.js';
const socket = process.env.IMAGE_PREVIEW_TEST_SOCKET;
const database = `ln_image_preview_test_${process.pid}`;
let db, admin;
const refs = async () => {
  const [r] = await db.query('SELECT * FROM image_asset_refs');
  return r;
};
const transaction = async (fn) => {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
};
async function asset() {
  await db.query("INSERT IGNORE INTO files VALUES (1,'u1',0,'test-image.png','test-image.png',0)");
  return transaction((c) =>
    registerAsset(c, {
      owner: 'u1',
      sourceType: 'cloud_file',
      sourceId: '1',
      locator: 'test-image.png',
      storage: 'obs',
      reconciled: true,
    }),
  );
}
describe.skipIf(!socket)('image lifecycle on isolated local MySQL', () => {
  beforeAll(async () => {
    if (!socket.startsWith('/tmp/')) throw new Error('ISOLATED_TEST_SOCKET_REQUIRED');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = mysql.createPool({ socketPath: socket, user: 'root', database, connectionLimit: 4, multipleStatements: true });
    const dump = await fs
      .readFile(new URL('../../tag_db.sql', import.meta.url), 'utf8')
      .catch(() => fs.readFile(new URL('../../../tag_db.sql', import.meta.url), 'utf8'));
    for (const name of ['file_preview_artifacts', 'file_preview_jobs']) {
      const ddl = dump.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?;'))?.[0];
      await db.query(ddl);
    }
    for (const ddl of imageSchemaStatements) await db.query(ddl);
    const migration = await fs.readFile(
      new URL('../../migrations/20260908_common_image_previews.sql', import.meta.url),
      'utf8',
    );
    await db.query(migration);
    await db.query(migration);
    const metadataMigration = await fs.readFile(
      new URL('../../migrations/20260909_image_preview_metadata.sql', import.meta.url),
      'utf8',
    );
    await db.query(metadataMigration);
    await db.query(metadataMigration);
    await db.query(
      'CREATE TABLE note(id VARCHAR(255) PRIMARY KEY,create_by VARCHAR(255),content TEXT,type VARCHAR(20),del_flag INT DEFAULT 0)',
    );
    await db.query('CREATE TABLE note_images(id INT AUTO_INCREMENT PRIMARY KEY,note_id VARCHAR(255),url TEXT)');
    await db.query(
      'CREATE TABLE note_versions(id VARCHAR(255) PRIMARY KEY,note_id VARCHAR(255),content TEXT,type VARCHAR(20))',
    );
    await db.query(
      'CREATE TABLE files(id INT PRIMARY KEY,create_by VARCHAR(255),del_flag INT DEFAULT 0,file_name VARCHAR(255),obs_key VARCHAR(255),file_size INT)',
    );
  });
  beforeEach(async () => {
    for (const t of [
      'file_preview_jobs',
      'file_preview_artifacts',
      'image_asset_refs',
      'image_assets',
      'note_images',
      'note_versions',
      'note',
      'files',
    ])
      await db.query(`DELETE FROM ${t}`);
    vi.stubEnv('IMAGE_PREVIEW_CLEANUP_ENABLED', 'true');
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE ${database}`);
      await admin.end();
    }
  });
  it.each([false, true])('persists MP3 cover outcome and preserves audio size (absent=%s)', async (noCover) => {
    await db.query("INSERT INTO files VALUES (1,'u1',0,'song.mp3','audio-key',9000000)");
    const [[file]] = await db.query('SELECT * FROM files WHERE id=1');
    const registered = await transaction((c) => registerCloudImage(c, file));
    expect(registered).toBeTruthy();
    const compress = vi.fn(async () => ({ body: Buffer.from('webp'), width: 320, height: 320 }));
    const put = vi.fn();
    await runSingleImagePreviewJob('audio-test', {
      db,
      compress,
      put,
      remove: vi.fn(),
      metadata: async () => ({ version: 'metadata' }),
      read: async (job) => {
        expect(job.source_file_name).toBe('song.mp3');
        return {
          noCover,
          body: noCover ? null : Buffer.from('picture'),
          revision: hash('tag'),
          version: 'metadata',
          sourceSize: 9000000,
        };
      },
    });
    const [[job]] = await db.query('SELECT * FROM file_preview_jobs');
    const [[assetRow]] = await db.query('SELECT * FROM image_assets');
    const [[artifact]] = await db.query('SELECT * FROM file_preview_artifacts');
    expect(job.status).toBe('completed');
    expect(job.error_code).toBeNull();
    expect(assetRow.source_size).toBe(9000000);
    expect(artifact.source_size).toBe(9000000);
    expect(artifact.status).toBe('ready');
    expect(compress).toHaveBeenCalledTimes(noCover ? 0 : 1);
    expect(put).toHaveBeenCalledTimes(noCover ? 0 : 1);
    const [state] = await resolveImagePreviews('u1', [{ sourceType: 'cloud_file', sourceId: '1' }], {
      db,
      sign: () => ({ url: 'preview' }),
    });
    expect(state.status).toBe(noCover ? 'unsupported' : 'ready');
    expect(state.url).toBe(noCover ? null : 'preview');
    expect((await db.query('SELECT * FROM file_preview_jobs'))[0]).toHaveLength(1);
    await transaction((c) => removeImageReferences(c, 'cloud_file', ['1']));
    expect((await db.query('SELECT status FROM image_assets'))[0][0].status).toBe('pending_delete');
  });
  it('deduplicates tasks and keeps active images while any ref exists', async () => {
    const a = await asset();
    await asset();
    expect((await db.query('SELECT * FROM file_preview_jobs'))[0]).toHaveLength(1);
    await transaction(async (c) => {
      await replaceReferences(c, 'note', 'n1', [a.id]);
      await replaceReferences(c, 'note_version', 'v1', [a.id]);
      await removeImageReferences(c, 'note', ['n1']);
    });
    expect(await refs()).toHaveLength(1);
    expect((await db.query('SELECT status FROM image_assets'))[0][0].status).toBe('active');
    await transaction((c) => removeImageReferences(c, 'note_version', ['v1']));
    const [[r]] = await db.query('SELECT status,TIMESTAMPDIFF(HOUR,NOW(),cleanup_after) AS hours FROM image_assets');
    expect(r.status).toBe('pending_delete');
    expect(r.hours).toBeGreaterThanOrEqual(23);
    await transaction((c) => replaceReferences(c, 'note', 'n2', [a.id]));
    expect((await db.query('SELECT cleanup_after FROM image_assets'))[0][0].cleanup_after).toBeNull();
  });
  it('rolls back a saved-content image removal and keeps retained history', async () => {
    const url = 'https://boluo66.top/uploads/a.png';
    await db.query("INSERT INTO note VALUES ('n','u1',?,'html',0)", [`<img src="${url}">`]);
    await db.query("INSERT INTO note_images(note_id,url) VALUES('n',?)", [url]);
    await transaction((c) =>
      syncContentReferences(c, { owner: 'u1', refType: 'note', refId: 'n', content: `<img src="${url}">` }),
    );
    await expect(
      transaction(async (c) => {
        await syncContentReferences(c, { owner: 'u1', refType: 'note', refId: 'n', content: '<p></p>' });
        throw new Error('SAVE_FAILED');
      }),
    ).rejects.toThrow('SAVE_FAILED');
    expect(await refs()).toHaveLength(1);
    await transaction((c) =>
      syncContentReferences(c, { owner: 'u1', refType: 'note', refId: 'n', content: '<p></p>' }),
    );
    expect(await refs()).toHaveLength(0);
  });
  it('never signs an unauthorized source or accepts arbitrary URLs', async () => {
    const sign = vi.fn();
    expect(() => validateResolveItems([{ sourceType: 'note', sourceId: 'n', url: 'https://private.test' }])).toThrow();
    const r = await resolveImagePreviews('other', [{ sourceType: 'note', sourceId: 'n' }], { db, sign });
    expect(r[0].status).toBe('unavailable');
    expect(sign).not.toHaveBeenCalled();
  });
  it('persists output and retries transient upload errors without losing its cleanup identity', async () => {
    await asset();
    const put = vi.fn().mockRejectedValueOnce(new Error('UPLOAD_FAILED'));
    const deps = {
      db,
      read: async () => ({ body: Buffer.from('input'), version: 'meta' }),
      compress: async () => ({ body: Buffer.from('webp'), width: 1, height: 1 }),
      put,
      remove: vi.fn(),
      metadata: async () => ({ version: 'meta' }),
    };
    await runSingleImagePreviewJob('test', deps);
    let [[job]] = await db.query('SELECT * FROM file_preview_jobs');
    expect(job.status).toBe('queued');
    expect(job.output_object_key).toBeTruthy();
    expect(JSON.parse(job.output_keys_json)).toHaveLength(1);
    await db.query('UPDATE file_preview_jobs SET available_at=NOW()');
    put.mockResolvedValue(undefined);
    await runSingleImagePreviewJob('test', deps);
    [[job]] = await db.query('SELECT * FROM file_preview_jobs');
    expect(job.status).toBe('completed');
    const [[out]] = await db.query('SELECT * FROM file_preview_artifacts');
    expect(out.status).toBe('ready');
    expect(out.source_revision).toBe(hash('input'));
  });
  it('refuses publishing and new references after deletion begins', async () => {
    const a = await asset();
    const put = async () => {
      await db.query("UPDATE image_assets SET status='deleting' WHERE id=?", [a.id]);
    };
    await runSingleImagePreviewJob('test', {
      db,
      read: async () => ({ body: Buffer.from('input'), version: 'v' }),
      compress: async () => ({ body: Buffer.from('webp'), width: 1, height: 1 }),
      put,
      remove: vi.fn(),
      metadata: async () => ({ version: 'v' }),
    });
    expect((await db.query('SELECT status FROM file_preview_artifacts'))[0][0].status).not.toBe('ready');
    await expect(transaction((c) => replaceReferences(c, 'note', 'new', [a.id]))).rejects.toMatchObject({
      code: 'IMAGE_SOURCE_DELETING',
    });
    expect(
      JSON.parse((await db.query('SELECT output_keys_json FROM file_preview_jobs'))[0][0].output_keys_json),
    ).toHaveLength(1);
  });
  it('retains cleanup records when object deletion fails and deletes only after grace', async () => {
    await asset();
    const removeSource = vi.fn().mockRejectedValueOnce(new Error('OBS_BUSY'));
    await cleanupImageAssets({ db, removeSource, remove: vi.fn() });
    expect(removeSource).not.toHaveBeenCalled();
    await db.query('UPDATE image_assets SET cleanup_after=DATE_SUB(NOW(),INTERVAL 1 SECOND)');
    await cleanupImageAssets({ db, removeSource, remove: vi.fn() });
    expect((await db.query('SELECT * FROM image_assets'))[0]).toHaveLength(1);
    await db.query(
      'UPDATE image_assets SET cleanup_after=DATE_SUB(NOW(),INTERVAL 1 SECOND),delete_started_at=DATE_SUB(NOW(),INTERVAL 25 HOUR)',
    );
    removeSource.mockResolvedValue(undefined);
    await cleanupImageAssets({ db, removeSource, remove: vi.fn() });
    expect((await db.query('SELECT * FROM image_assets'))[0]).toHaveLength(0);
  });
  it('records missing sources as a terminal source failure without invoking conversion', async () => {
    await asset();
    const compress = vi.fn();
    await runSingleImagePreviewJob('missing', {
      db,
      read: async () => {
        throw Object.assign(new Error('private path'), { code: 'ENOENT' });
      },
      compress,
    });
    const [[job]] = await db.query('SELECT status,error_code,attempts FROM file_preview_jobs');
    expect(job).toMatchObject({ status: 'failed', error_code: 'IMAGE_SOURCE_MISSING', attempts: 1 });
    expect(compress).not.toHaveBeenCalled();
  });
  it('claims a queued job once across concurrent workers and stores the long-image presentation', async () => {
    await asset();
    let release;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    const compress = vi.fn(async () => {
      await barrier;
      return { body: Buffer.from('webp'), width: 480, height: 720, presentation: 'long_top' };
    });
    const deps = {
      db,
      read: async () => ({ body: Buffer.from('input'), version: 'meta' }),
      compress,
      put: vi.fn(),
      remove: vi.fn(),
      metadata: async () => ({ version: 'meta' }),
    };
    const first = runSingleImagePreviewJob('first', deps);
    await vi.waitFor(() => expect(compress).toHaveBeenCalledTimes(1));
    expect(await runSingleImagePreviewJob('second', deps)).toBe(false);
    release();
    await first;
    const [[out]] = await db.query('SELECT status,preview_metadata_json FROM file_preview_artifacts');
    expect(out.status).toBe('ready');
    expect(JSON.parse(out.preview_metadata_json)).toEqual({ presentation: 'long_top' });
  });
  it('does not claim unsupported future strategies and never publishes a changed source', async () => {
    const a = await asset();
    await db.query('UPDATE file_preview_artifacts SET strategy_version=99');
    const read = vi.fn();
    expect(await runSingleImagePreviewJob('old', { db, read })).toBe(false);
    expect(read).not.toHaveBeenCalled();
    await db.query('UPDATE file_preview_artifacts SET strategy_version=2');
    await runSingleImagePreviewJob('changed', {
      db,
      read: async () => ({ body: Buffer.from('input'), version: 'old' }),
      compress: async () => ({ body: Buffer.from('webp'), width: 1, height: 1 }),
      put: vi.fn(),
      remove: vi.fn(),
      metadata: async () => ({ version: 'new' }),
    });
    const [[out]] = await db.query('SELECT status,error_code FROM file_preview_artifacts');
    expect(out.status).not.toBe('ready');
    expect(out.error_code).toBe('IMAGE_SOURCE_CHANGED');
  });

  it('serializes duplicate user retries and preserves server cooldown', async () => {
    await asset();
    await db.query(
      "UPDATE file_preview_jobs SET status='failed',attempts=3,error_code='IMAGE_STORAGE_UNAVAILABLE',available_at=DATE_SUB(NOW(),INTERVAL 1 SECOND)",
    );
    await db.query("UPDATE file_preview_artifacts SET status='failed',error_code='IMAGE_STORAGE_UNAVAILABLE'");
    await Promise.all([
      retryImagePreview('u1', { sourceType: 'cloud_file', sourceId: '1' }, { db }),
      retryImagePreview('u1', { sourceType: 'cloud_file', sourceId: '1' }, { db }),
    ]);
    const [[job]] = await db.query(
      'SELECT status,attempts,TIMESTAMPDIFF(SECOND,NOW(),available_at) AS delay_seconds FROM file_preview_jobs',
    );
    expect(job.status).toBe('queued');
    expect(job.attempts).toBe(0);
    expect(job.delay_seconds).toBeGreaterThan(55);
    expect((await db.query('SELECT id FROM file_preview_jobs'))[0]).toHaveLength(1);
  });
});

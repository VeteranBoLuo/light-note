import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null, body: null, put: vi.fn(), remove: vi.fn() }));
vi.mock('../../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: (...args) => state.db.getConnection(...args),
  },
}));
vi.mock('../obsClient.js', () => ({
  buildObjectKey: (owner, name) => `${owner}/${name}`,
  getObjectMetadataFromObs: async () => ({ contentLength: state.body.length, etag: 'version-1' }),
  getObjectRangeFromObs: async () => state.body,
  getObjectBufferFromObs: async () => state.body,
  createDownloadSignedUrl: ({ objectKey }) => ({ url: `https://preview.invalid/${objectKey}` }),
  putObjectBodyToObs: state.put,
  deleteObjectFromObs: state.remove,
}));
import { prepareFilePreview, resolveFilePreview, runSingleFilePreviewJob } from './service.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `heif_preview_${randomUUID().replaceAll('-', '')}`;
let admin,
  created = false;
describe.skipIf(!socketPath)('HEIF jobs on isolated MySQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    state.db = mysql.createPool({
      socketPath,
      user: 'root',
      database: schema,
      connectionLimit: 6,
      multipleStatements: true,
    });
    const dump = await readFile(new URL('../../tag_db.sql', import.meta.url), 'utf8');
    for (const name of ['file_preview_artifacts', 'file_preview_jobs'])
      await state.db.query(dump.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?;'))[0]);
    await state.db.query(
      await readFile(new URL('../../migrations/20260908_common_image_previews.sql', import.meta.url), 'utf8'),
    );
    await state.db.query(
      `CREATE TABLE files (id INT PRIMARY KEY, create_by VARCHAR(255), file_name VARCHAR(255), file_type VARCHAR(255), file_size BIGINT, obs_key VARCHAR(255), del_flag INT) ENGINE=InnoDB`,
    );
    await state.db.query(
      `CREATE TABLE community_chat_message_files (id INT PRIMARY KEY, owner_user_id VARCHAR(255), file_name VARCHAR(255), content_type VARCHAR(255), file_size BIGINT, object_key VARCHAR(255), status VARCHAR(20), message_id INT, expires_at DATETIME) ENGINE=InnoDB`,
    );
    state.body = await readFile(new URL('../imagePreview/fixtures/primary.heic', import.meta.url));
  });
  beforeEach(async () => {
    state.put.mockReset();
    state.remove.mockReset();
    await state.db.query('DELETE FROM file_preview_jobs');
    await state.db.query('DELETE FROM file_preview_artifacts');
    await state.db.query('DELETE FROM files');
    await state.db.query('DELETE FROM community_chat_message_files');
    await state.db.query("INSERT INTO files VALUES (1,'owner','photo.heic','image/heic',?,'original-key',0)", [
      state.body.length,
    ]);
  });
  afterAll(async () => {
    await state.db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  it('deduplicates concurrent prepares, converts once, caches the derivative, and preserves original metadata', async () => {
    await expect(resolveFilePreview({ ownerUserId: 'other', fileId: 1 })).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });
    await Promise.all(Array.from({ length: 3 }, () => prepareFilePreview({ ownerUserId: 'owner', fileId: 1 })));
    const [[jobs]] = await state.db.query('SELECT COUNT(*) AS n FROM file_preview_jobs');
    expect(jobs.n).toBe(1);
    vi.stubEnv('IMAGE_PREVIEW_GENERATION_ENABLED', 'false');
    expect(await runSingleFilePreviewJob('disabled-heif')).toBe(false);
    vi.unstubAllEnvs();
    expect(await runSingleFilePreviewJob('heif-test')).toBe(true);
    expect(await runSingleFilePreviewJob('heif-test')).toBe(false);
    const result = await resolveFilePreview({ ownerUserId: 'owner', fileId: 1, touch: false });
    expect(result).toMatchObject({
      status: 'ready',
      previewType: 'image',
      strategy: 'image_display',
      sourceDownloadUrl: 'https://preview.invalid/original-key',
    });
    expect(result.previewUrl).toMatch(/file-previews\/owner\/1\/.+\.webp$/);
    expect(state.put).toHaveBeenCalledOnce();
    expect(state.remove).not.toHaveBeenCalled();
    const [[file]] = await state.db.query('SELECT * FROM files');
    expect(file).toMatchObject({ file_name: 'photo.heic', obs_key: 'original-key', file_size: state.body.length });
  });
  it('discards converted output when the source is removed before publication', async () => {
    await prepareFilePreview({ ownerUserId: 'owner', fileId: 1 });
    state.put.mockImplementation(async () => {
      await state.db.query('UPDATE files SET del_flag=1');
    });
    await runSingleFilePreviewJob('deleted-source');
    const [[artifact]] = await state.db.query('SELECT status FROM file_preview_artifacts');
    expect(artifact.status).not.toBe('ready');
    expect(state.remove).toHaveBeenCalledWith(state.put.mock.calls[0][0]);
    expect(state.remove).not.toHaveBeenCalledWith('original-key');
  });
  it('bounds chat display URLs by attachment expiry and rejects expired sources', async () => {
    await state.db.query(
      "INSERT INTO community_chat_message_files VALUES (1,'owner','chat.heic','image/heic',?,'chat-original','attached',1,DATE_ADD(NOW(),INTERVAL 30 SECOND))",
      [state.body.length],
    );
    const input = { ownerUserId: 'owner', fileId: 1, sourceType: 'community_chat_file' };
    await prepareFilePreview(input);
    await runSingleFilePreviewJob('chat-heif');
    const result = await resolveFilePreview({ ...input, touch: false });
    expect(result.status).toBe('ready');
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(result.expiresIn).toBeLessThan(30);
    await state.db.query('UPDATE community_chat_message_files SET expires_at=NOW()');
    await expect(resolveFilePreview(input)).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_FILE_EXPIRED' });
  });
});

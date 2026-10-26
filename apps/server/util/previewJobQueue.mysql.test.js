import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_IMAGE_PROFILE } from '@lightnote/shared';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: (...args) => state.db.getConnection(...args),
  },
}));
vi.mock('./obsClient.js', () => ({
  buildObjectKey: (owner, name) => `${owner}/${name}`,
  createDownloadSignedUrl: () => ({ url: 'https://preview.invalid/result' }),
  getObjectMetadataFromObs: async () => ({ contentLength: 8, etag: 'version-1' }),
  getObjectBufferFromObs: async () => Buffer.alloc(8),
  getObjectRangeFromObs: async () => Buffer.alloc(8),
  putObjectBodyToObs: async () => {},
  deleteObjectFromObs: async () => {},
}));
vi.mock('./filePreview/office.js', () => ({ convertOfficeToPdf: async () => Buffer.from('%PDF-preview') }));

import { imageSchemaStatements } from './imagePreview/schema.js';
import { registerCloudImage, queuePreview } from './imagePreview/references.js';
import { runSingleImagePreviewJob, runSingleVideoPreviewJob } from './imagePreview/worker.js';
import { runSingleFilePreviewJob } from './filePreview/service.js';

import { expirePreviewLeases } from './previewJobQueue.js';
import { retryImagePreview } from './imagePreview/service.js';

const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `preview_queue_${randomUUID().replaceAll('-', '')}`;
const digest = (value) => createHash('sha256').update(value).digest('hex');
let admin,
  db,
  created = false;

const settle = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function image(format = 'card', id = 1) {
  const file = {
    id,
    create_by: 'owner',
    file_name: format === 'video-card' ? `clip-${id}.mov` : `image-${id}.png`,
    file_type: '',
    file_size: 8,
    obs_key: `source-${id}`,
    del_flag: 0,
  };
  await db.query('INSERT INTO files SET ?', file);
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const asset = await registerCloudImage(c, file);
    await c.commit();
    return asset;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}

async function document(id = 1) {
  await db.query('INSERT INTO files SET ?', {
    id,
    create_by: 'owner',
    file_name: 'legacy.doc',
    file_type: 'application/msword',
    file_size: 8,
    obs_key: `document-${id}`,
    del_flag: 0,
  });
  const [a] = await db.query(
    "INSERT INTO file_preview_artifacts(source_type,file_id,owner_user_id,strategy,strategy_version,format_id,source_etag,source_size,status) VALUES ('cloud_file',?,'owner','converted_pdf',1,'legacy-word','version-1',8,'queued')",
    [id],
  );
  await db.query('INSERT INTO file_preview_jobs(artifact_id) VALUES (?)', [a.insertId]);
}

function dependencies(database = db) {
  return {
    db: database,
    read: vi.fn(async () => ({ body: Buffer.from('source'), version: 'metadata' })),
    compress: vi.fn(async () => ({ body: Buffer.from('webp'), width: 1, height: 1 })),
    put: vi.fn(),
    remove: vi.fn(),
    metadata: async () => ({ version: 'metadata' }),
  };
}

async function waitForWorkerLock(threadIds, pending) {
  for (let n = 0; n < 200; n++) {
    if (threadIds.length) {
      const [rows] = await admin.query(
        'SELECT trx_state FROM information_schema.innodb_trx WHERE trx_mysql_thread_id IN (?)',
        [threadIds],
      );
      if (rows.some((r) => r.trx_state === 'LOCK WAIT')) return;
    }
    const finished = await Promise.race([pending.then(() => true), pause(10).then(() => false)]);
    if (finished) throw Error('Worker finished before the source-lock contention was exercised');
  }
  const [locks] = await admin.query(
    'SELECT trx_state,trx_mysql_thread_id,trx_query FROM information_schema.innodb_trx',
  );
  const [processes] = await admin.query('SELECT ID,STATE,INFO FROM information_schema.PROCESSLIST WHERE DB=?', [
    schema,
  ]);
  throw Error(JSON.stringify({ threadIds, locks, processes }));
}

function trackedDatabase(ids) {
  return {
    query: (...args) => db.query(...args),
    async getConnection() {
      const c = await db.getConnection();
      ids.push(c.threadId);
      return c;
    },
  };
}

describe.skipIf(!socket)('preview queue concurrency on isolated MySQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw Error('Temporary MySQL socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[runtime]] = await admin.query('SELECT VERSION() version,@@skip_networking isolated');
    if (Number(runtime.isolated) !== 1) throw Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({
      socketPath: socket,
      user: 'root',
      database: schema,
      connectionLimit: 12,
      multipleStatements: true,
    });
    state.db = db;
    const dump = await readFile(new URL('../tag_db.sql', import.meta.url), 'utf8');
    for (const name of ['file_preview_artifacts', 'file_preview_jobs'])
      await db.query(dump.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?;'))[0]);
    for (const ddl of imageSchemaStatements) await db.query(ddl);
    for (const migration of ['20260908_common_image_previews.sql', '20260909_image_preview_metadata.sql'])
      await db.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    await db.query(
      'CREATE TABLE files(id BIGINT PRIMARY KEY,create_by VARCHAR(255),file_name VARCHAR(255),file_type VARCHAR(255),file_size BIGINT,obs_key VARCHAR(255),del_flag INT) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE community_chat_message_files(id BIGINT PRIMARY KEY,owner_user_id VARCHAR(255),file_name VARCHAR(255),content_type VARCHAR(255),file_size BIGINT,object_key VARCHAR(255),status VARCHAR(20),message_id BIGINT,expires_at DATETIME) ENGINE=InnoDB',
    );
  });
  afterEach(() => {
    state.db = db;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    for (const table of [
      'file_preview_jobs',
      'file_preview_artifacts',
      'image_asset_refs',
      'image_assets',
      'files',
      'community_chat_message_files',
    ])
      await db.query(`DELETE FROM ${table}`);
    // A realistic terminal history makes the old status-index scan visible to InnoDB.
    const history = Array.from({ length: 500 }, (_, i) => i + 10000);
    await db.query(
      'INSERT INTO image_assets(id,owner_user_id,source_type,source_id,identity_hash,storage_kind,source_locator,source_version,status) VALUES ?',
      [
        history.map((id) => [
          id,
          'history',
          'note_image',
          String(id),
          digest(String(id)),
          'obs',
          `history-${id}`,
          digest('version'),
          'active',
        ]),
      ],
    );
    await db.query(
      'INSERT INTO file_preview_artifacts(id,source_type,file_id,owner_user_id,strategy,strategy_version,format_id,source_etag,source_size,source_revision,status) VALUES ?',
      [
        history.map((id) => [
          id,
          'image_asset',
          id,
          'history',
          'image_thumbnail',
          CARD_IMAGE_PROFILE.version,
          'card',
          digest('version'),
          8,
          digest('version'),
          'ready',
        ]),
      ],
    );
    await db.query('INSERT INTO file_preview_jobs(id,artifact_id,status,attempts) VALUES ?', [
      history.map((id) => [id, id, 'completed', 1]),
    ]);
    vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'production');
    vi.stubEnv('IMAGE_PREVIEW_GENERATION_ENABLED', 'true');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  it.each(['card', 'video-card'])(
    'does not hold job/artifact locks while waiting for an upload of %s',
    async (format) => {
      const asset = await image(format);
      const upload = await db.getConnection();
      const workerIds = [];
      let pending;
      try {
        await upload.beginTransaction();
        await upload.query('SELECT id FROM image_assets WHERE id=? FOR UPDATE', [asset.id]);
        const deps = dependencies(trackedDatabase(workerIds));
        pending = settle(
          format === 'card' ? runSingleImagePreviewJob('worker', deps) : runSingleVideoPreviewJob('worker', deps),
        );
        await waitForWorkerLock(workerIds, pending);
        const queued = await settle(queuePreview(upload, { ...asset, preview_format: format }));
        if (queued.error) await upload.rollback();
        else await upload.commit();
        const outcome = await pending;
        expect(queued.error?.code).toBeUndefined();
        expect(outcome.error?.code).toBeUndefined();
        expect(outcome.value).toBe(true);
        expect(deps.put).toHaveBeenCalledOnce();
        const [[job]] = await db.query(
          'SELECT status,attempts FROM file_preview_jobs WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id=?)',
          ['owner'],
        );
        expect(job).toEqual({ status: 'completed', attempts: 1 });
      } finally {
        await upload.rollback();
        upload.release();
        await pending;
      }
    },
    15000,
  );
  it.each(['card', 'video-card'])(
    'rechecks a %s candidate cancelled while waiting for its source',
    async (format) => {
      const asset = await image(format);
      const holder = await db.getConnection(),
        workerIds = [];
      let pending;
      try {
        await holder.beginTransaction();
        await holder.query('SELECT id FROM image_assets WHERE id=? FOR UPDATE', [asset.id]);
        const deps = dependencies(trackedDatabase(workerIds));
        pending = settle(
          format === 'card' ? runSingleImagePreviewJob('stale', deps) : runSingleVideoPreviewJob('stale', deps),
        );
        await waitForWorkerLock(workerIds, pending);
        await holder.query("UPDATE image_assets SET status='deleting' WHERE id=?", [asset.id]);
        await holder.commit();
        expect(await pending).toEqual({ value: false });
        expect(deps.read).not.toHaveBeenCalled();
        const [[job]] = await db.query(
          'SELECT status,attempts FROM file_preview_jobs WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id=?)',
          ['owner'],
        );
        expect(job).toEqual({ status: 'queued', attempts: 0 });
      } finally {
        await holder.rollback();
        holder.release();
        await pending;
      }
    },
    15000,
  );

  it('rechecks source revision using the snapshot after a contended source lock', async () => {
    const asset = await image();
    const holder = await db.getConnection(),
      workerIds = [];
    let pending;
    try {
      await holder.beginTransaction();
      await holder.query('SELECT id FROM image_assets WHERE id=? FOR UPDATE', [asset.id]);
      const deps = dependencies(trackedDatabase(workerIds));
      pending = settle(runSingleImagePreviewJob('changed', deps));
      await waitForWorkerLock(workerIds, pending);
      await holder.query('UPDATE image_assets SET source_version=? WHERE id=?', [digest('changed'), asset.id]);
      await holder.commit();
      expect(await pending).toEqual({ value: false });
      expect(deps.put).not.toHaveBeenCalled();
    } finally {
      await holder.rollback();
      holder.release();
      await pending;
    }
  }, 15000);

  it('empty document/video polls do not wait for another lane or alter historical jobs', async () => {
    await image();
    await db.query(
      "UPDATE file_preview_jobs SET status='processing',locked_at=NOW(),attempts=1 WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id='owner')",
    );
    const [before] = await db.query('SELECT id,status,attempts,update_time FROM file_preview_jobs ORDER BY id');
    const holder = await db.getConnection();
    let pending;
    try {
      await holder.beginTransaction();
      await holder.query(
        "SELECT j.id FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id WHERE a.owner_user_id='owner' FOR UPDATE",
      );
      pending = settle(
        Promise.all([
          runSingleFilePreviewJob('empty-document'),
          runSingleVideoPreviewJob('empty-video', dependencies()),
        ]),
      );
      const result = await Promise.race([pending, pause(800).then(() => ({ timedOut: true }))]);
      expect(result).toEqual({ value: [false, false] });
    } finally {
      await holder.rollback();
      holder.release();
      await pending;
    }
    const [after] = await db.query('SELECT id,status,attempts,update_time FROM file_preview_jobs ORDER BY id');
    expect(after).toEqual(before);
  }, 10000);

  it('documents wait for the source without blocking a concurrent prepare/reset', async () => {
    await document();
    const holder = await db.getConnection(),
      workerIds = [];
    let pending;
    try {
      await holder.beginTransaction();
      await holder.query('SELECT id FROM files WHERE id=1 FOR UPDATE');
      state.db = trackedDatabase(workerIds);
      pending = settle(runSingleFilePreviewJob('document'));
      await waitForWorkerLock(workerIds, pending);
      await holder.query("UPDATE file_preview_artifacts SET source_etag='version-1' WHERE owner_user_id='owner'");
      await holder.query(
        "UPDATE file_preview_jobs SET status='queued' WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id='owner')",
      );
      await holder.commit();
      expect(await pending).toEqual({ value: true });
      const [[job]] = await db.query(
        'SELECT status,attempts FROM file_preview_jobs WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id=?)',
        ['owner'],
      );
      expect(job).toEqual({ status: 'completed', attempts: 1 });
    } finally {
      await holder.rollback();
      holder.release();
      await pending;
      state.db = db;
    }
  }, 15000);

  it('finishes fresh mixed-lane batches once across competing consumers', async () => {
    const [historyBefore] = await db.query('SELECT id,status,attempts,update_time FROM file_preview_jobs ORDER BY id');
    for (let round = 0; round < 25; round++) {
      const id = round * 10 + 1;
      await image('card', id);
      await image('video-card', id + 1);
      await document(id + 2);
      const outcomes = await Promise.allSettled([
        runSingleImagePreviewJob('image-1', dependencies()),
        runSingleImagePreviewJob('image-2', dependencies()),
        runSingleVideoPreviewJob('video-1', dependencies()),
        runSingleVideoPreviewJob('video-2', dependencies()),
        runSingleFilePreviewJob('file-1'),
        runSingleFilePreviewJob('file-2'),
      ]);
      expect(outcomes.filter((r) => r.status === 'rejected').map((r) => r.reason?.code)).toEqual([]);
      expect(outcomes.filter((r) => r.value === true)).toHaveLength(3);
    }
    const [newJobs] = await db.query(
      "SELECT j.status,j.attempts FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id WHERE a.owner_user_id='owner'",
    );
    expect(newJobs).toHaveLength(75);
    expect(newJobs.every((j) => j.status === 'completed' && j.attempts === 1)).toBe(true);
    const [historyAfter] = await db.query(
      'SELECT id,status,attempts,update_time FROM file_preview_jobs WHERE id IN (?) ORDER BY id',
      [historyBefore.map((j) => j.id)],
    );
    expect(historyAfter).toEqual(historyBefore);
  }, 30000);

  it('expires only abandoned final attempts in their own lane, preserving current and terminal facts', async () => {
    const asset = await image();
    await document(2);
    await db.query(
      "UPDATE file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id SET j.status='processing',j.attempts=3,j.locked_at=DATE_SUB(NOW(),INTERVAL 3 MINUTE),j.output_keys_json='[\"attempt-output\"]',a.status='processing' WHERE a.owner_user_id='owner'",
    );
    const [history] = await db.query(
      'SELECT id,status,attempts,update_time FROM file_preview_jobs WHERE id BETWEEN 10000 AND 10499 ORDER BY id',
    );
    // A document lease lasts 10 min; image/video leases last 2 min.
    expect(await runSingleFilePreviewJob('not-expired')).toBe(false);
    await expirePreviewLeases(db, { sourceTypes: ['image_asset'], seconds: 120, code: 'IMAGE_WORKER_INTERRUPTED' });
    const [[imageJob]] = await db.query(
      'SELECT j.status,j.error_code,j.attempts,j.output_keys_json FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id WHERE a.file_id=? AND a.source_type=?',
      [asset.id, 'image_asset'],
    );
    expect(imageJob).toEqual({
      status: 'failed',
      error_code: 'IMAGE_WORKER_INTERRUPTED',
      attempts: 3,
      output_keys_json: '["attempt-output"]',
    });
    const [[documentJob]] = await db.query(
      "SELECT j.id,j.status FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id WHERE a.source_type='cloud_file'",
    );
    expect(documentJob.status).toBe('processing');
    await db.query('UPDATE file_preview_jobs SET locked_at=DATE_SUB(NOW(),INTERVAL 11 MINUTE) WHERE id=?', [
      documentJob.id,
    ]);
    expect(await runSingleFilePreviewJob('expired-document')).toBe(false);
    const [[expired]] = await db.query(
      'SELECT status,error_code,attempts,output_keys_json FROM file_preview_jobs WHERE id=?',
      [documentJob.id],
    );
    expect(expired).toEqual({
      status: 'failed',
      error_code: 'FILE_PREVIEW_WORKER_INTERRUPTED',
      attempts: 3,
      output_keys_json: '["attempt-output"]',
    });
    expect(
      (
        await db.query(
          'SELECT id,status,attempts,update_time FROM file_preview_jobs WHERE id BETWEEN 10000 AND 10499 ORDER BY id',
        )
      )[0],
    ).toEqual(history);
  });

  it('does not let a failed old lease overwrite a replacement worker', async () => {
    await image();
    const deps = dependencies();
    deps.read.mockImplementation(async () => {
      await db.query(
        "UPDATE file_preview_jobs SET locked_by='replacement',attempts=2 WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id='owner')",
      );
      throw Object.assign(new Error('synthetic source failure'), { code: 'IMAGE_SOURCE_MISSING' });
    });
    expect(await runSingleImagePreviewJob('old', deps)).toBe(true);
    const [[job]] = await db.query(
      "SELECT status,attempts,locked_by,error_code FROM file_preview_jobs WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id='owner')",
    );
    expect(job).toEqual({ status: 'processing', attempts: 2, locked_by: 'replacement', error_code: null });
    const [[artifact]] = await db.query(
      "SELECT status,error_code FROM file_preview_artifacts WHERE owner_user_id='owner'",
    );
    expect(artifact).toEqual({ status: 'processing', error_code: null });
  });
  it('document and video lanes leave an eligible queued image untouched', async () => {
    await image();
    expect(
      await Promise.all([runSingleFilePreviewJob('document'), runSingleVideoPreviewJob('video', dependencies())]),
    ).toEqual([false, false]);
    const [[job]] = await db.query(
      "SELECT status,attempts FROM file_preview_jobs WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id='owner')",
    );
    expect(job).toEqual({ status: 'queued', attempts: 0 });
    expect(await runSingleImagePreviewJob('image', dependencies())).toBe(true);
  });
  it('explicit retry rechecks deletion after waiting for the image source lock', async () => {
    const asset = await image();
    await db.query(
      "UPDATE file_preview_jobs SET status='failed',error_code='IMAGE_STORAGE_UNAVAILABLE',available_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id='owner')",
    );
    const holder = await db.getConnection(),
      workerIds = [];
    let pending;
    try {
      await holder.beginTransaction();
      await holder.query('SELECT id FROM image_assets WHERE id=? FOR UPDATE', [asset.id]);
      pending = settle(
        retryImagePreview('owner', { sourceType: 'cloud_file', sourceId: '1' }, { db: trackedDatabase(workerIds) }),
      );
      await waitForWorkerLock(workerIds, pending);
      await holder.query("UPDATE image_assets SET status='deleting' WHERE id=?", [asset.id]);
      await holder.commit();
      expect((await pending).error?.code).toBe('IMAGE_PREVIEW_NOT_FOUND');
      const [[job]] = await db.query(
        "SELECT status,error_code FROM file_preview_jobs WHERE artifact_id=(SELECT id FROM file_preview_artifacts WHERE owner_user_id='owner')",
      );
      expect(job).toEqual({ status: 'failed', error_code: 'IMAGE_STORAGE_UNAVAILABLE' });
    } finally {
      await holder.rollback();
      holder.release();
      await pending;
    }
  }, 15000);
});

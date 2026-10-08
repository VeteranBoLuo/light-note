import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../obsClient.js', () => ({
  buildObjectKey: (owner, name) => `files/${owner}/${name}`,
  createUploadSignedUrl: vi.fn(() => ({ url: 'signed', expiresIn: 900 })),
  deleteObjectFromObs: vi.fn(),
}));
import {
  prepareLegacyCloudUpload,
  reserveLegacyUploadConfirmation,
  lockLegacyUploadForConfirmation,
  queueLegacyObjectRetirement,
  cleanupLegacyCloudObject,
} from './cloudLegacyObjectLifecycle.js';
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const env = { LIGHTNOTE_RUNTIME_ENV: 'test' };
const schema = `legacy_lifecycle_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socket)('legacy upload retirement coordination (isolated MySQL)', () => {
  let admin,
    database,
    created = false;
  const key = 'files/owner/report.pdf';
  const prepare = () =>
    prepareLegacyCloudUpload({ userId: 'owner', fileName: 'report.pdf', fileType: 'application/pdf', database });
  const row = async () => (await database.query('SELECT * FROM cloud_legacy_object_lifecycle'))[0][0];
  const due = () => database.query('UPDATE cloud_legacy_object_lifecycle SET available_at=NOW()');
  const retire = () => queueLegacyObjectRetirement(database, 'owner', key);
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    database = mysql.createPool({
      socketPath: socket,
      user: 'root',
      database: schema,
      connectionLimit: 4,
      multipleStatements: true,
    });
    const ddl = await readFile(
      new URL('../../migrations/20260925_cloud_legacy_object_lifecycle.sql', import.meta.url),
      'utf8',
    );
    await database.query(ddl);
    await database.query(ddl);
    await database.query(`CREATE TABLE user (id VARCHAR(255) PRIMARY KEY,role VARCHAR(20) DEFAULT 'user',del_flag INT DEFAULT 0); INSERT INTO user (id) VALUES ('owner');
      CREATE TABLE files (id INT PRIMARY KEY, create_by VARCHAR(255), obs_key VARCHAR(500), file_name VARCHAR(255), del_flag INT DEFAULT 0);
      CREATE TABLE image_assets (id INT PRIMARY KEY, storage_kind VARCHAR(20), source_locator VARCHAR(500));`);
  });
  beforeEach(async () => {
    await database.query(
      "DELETE FROM cloud_legacy_object_lifecycle; DELETE FROM files; DELETE FROM image_assets; UPDATE user SET role='user',del_flag=0",
    );
  });
  afterAll(async () => {
    await database?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  it('does not recreate an upload alias after account deletion', async () => {
    await database.query("UPDATE user SET role='deleted',del_flag=1 WHERE id='owner'");
    await expect(prepare()).rejects.toMatchObject({ code: 'UPLOAD_OWNER_INACTIVE' });
    await expect(
      reserveLegacyUploadConfirmation({ userId: 'owner', fileName: 'report.pdf', database }),
    ).rejects.toMatchObject({ code: 'UPLOAD_OWNER_INACTIVE' });
    expect(await row()).toBeUndefined();
  });
  it('a signer waiting behind account deletion rechecks the committed owner state', async () => {
    const deleting = await database.getConnection();
    let pending;
    try {
      await deleting.beginTransaction();
      await deleting.query("UPDATE user SET role='deleted',del_flag=1 WHERE id='owner'");
      pending = prepare().then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await deleting.commit();
      expect((await pending).error).toMatchObject({ code: 'UPLOAD_OWNER_INACTIVE' });
      expect(await row()).toBeUndefined();
    } finally {
      await deleting.rollback();
      deleting.release();
      await pending;
    }
  });
  it('issues unique managed keys and retains the alias for old clients', async () => {
    const first = await prepare();
    const second = await prepare();
    expect(first.expiresIn).toBe(900);
    expect(first.objectKey).toMatch(/^files\/owner\/uploads\/[0-9a-f-]{36}$/);
    expect(second.objectKey).not.toBe(first.objectKey);
    expect(await reserveLegacyUploadConfirmation({ userId: 'owner', fileName: 'report.pdf', database })).toMatchObject({
      objectKey: second.objectKey,
    });
    const remove = vi.fn();
    await due();
    expect(await cleanupLegacyCloudObject({ database, env, remove })).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(await row()).toMatchObject({ upload_key: second.objectKey, available_at: null });
  });
  it('rolls retirement back with its file transaction and accepts old confirmations without a journal', async () => {
    const c = await database.getConnection();
    try {
      await c.beginTransaction();
      await c.query('SELECT id FROM user WHERE id=? FOR UPDATE', ['owner']);
      await queueLegacyObjectRetirement(c, 'owner', key);
      await c.rollback();
      expect(await row()).toBeUndefined();
      const { generation } = await reserveLegacyUploadConfirmation({
        userId: 'owner',
        fileName: 'report.pdf',
        database,
      });
      await c.beginTransaction();
      await lockLegacyUploadForConfirmation(c, 'owner', 'report.pdf', generation);
      await c.commit();
      expect((await row()).state).toBe('active');
    } finally {
      c.release();
    }
  });
  it('rejects stale HEAD results after the journal expires and is recreated', async () => {
    const first = await reserveLegacyUploadConfirmation({ userId: 'owner', fileName: 'report.pdf', database });
    await due();
    await cleanupLegacyCloudObject({ database, env, remove: vi.fn() });
    const next = await reserveLegacyUploadConfirmation({ userId: 'owner', fileName: 'report.pdf', database });
    expect(next.generation).not.toBe(first.generation);
    await expect(
      lockLegacyUploadForConfirmation(database, 'owner', 'report.pdf', first.generation),
    ).rejects.toMatchObject({ code: 'FILE_UPLOAD_OBJECT_BUSY' });
    await expect(lockLegacyUploadForConfirmation(database, 'owner', 'report.pdf', next.generation)).resolves.toBeTypeOf(
      'string',
    );
  });
  it('extends pending retirement for an old preissued URL confirmation', async () => {
    await retire();
    await due();
    await reserveLegacyUploadConfirmation({ userId: 'owner', fileName: 'report.pdf', database });
    expect((await row()).state).toBe('pending');
    expect(await cleanupLegacyCloudObject({ database, env, remove: vi.fn() })).toBe(false);
  });
  it.each(['live', 'deleted', 'null-key', 'empty-key', 'image'])('retains an object referenced by %s', async (kind) => {
    await retire();
    await due();
    if (kind === 'image') await database.query("INSERT INTO image_assets VALUES (1,'obs',?)", [key]);
    else
      await database.query('INSERT INTO files VALUES (1,?,?,?,?)', [
        'owner',
        kind === 'null-key' ? null : kind === 'empty-key' ? '' : key,
        'report.pdf',
        kind === 'deleted' ? 1 : 0,
      ]);
    const remove = vi.fn();
    expect(await cleanupLegacyCloudObject({ database, env, remove })).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(await row()).toBeUndefined();
  });
  it('releases SQL locks before remote deletion and refuses upload publication during deletion', async () => {
    await retire();
    await due();
    const remove = vi.fn(async () => {
      const c = await database.getConnection();
      try {
        await c.query('SET SESSION innodb_lock_wait_timeout=1');
        await c.beginTransaction();
        await c.query('SELECT id FROM user WHERE id=? FOR UPDATE', ['owner']);
        await expect(lockLegacyUploadForConfirmation(c, 'owner', 'report.pdf')).rejects.toMatchObject({
          code: 'FILE_UPLOAD_OBJECT_BUSY',
        });
        await c.rollback();
      } finally {
        c.release();
      }
      expect((await prepare()).objectKey).not.toBe(key);
      expect(await cleanupLegacyCloudObject({ database, env, remove: vi.fn() })).toBe(false);
    });
    await cleanupLegacyCloudObject({ database, env, remove });
    expect(remove).toHaveBeenCalledExactlyOnceWith(key);
    expect((await row()).state).toBe('retired');
    expect((await prepare()).objectKey).not.toBe(key);
  });
  it('keeps failed deletion fenced and retries the persisted intent', async () => {
    await retire();
    await due();
    await expect(
      cleanupLegacyCloudObject({
        database,
        env,
        remove: async () => {
          throw Error('storage unavailable');
        },
      }),
    ).rejects.toThrow('storage unavailable');
    expect(await row()).toMatchObject({ state: 'deleting', attempts: 1 });
    expect((await prepare()).objectKey).not.toBe(key);
    await due();
    await cleanupLegacyCloudObject({ database, env, remove: vi.fn() });
    expect((await row()).state).toBe('retired');
  });
  it('a late delete from an expired attempt cannot delete a subsequent upload', async () => {
    await retire();
    await due();
    const objects = new Map([[key, 'old content']]);
    let entered, finish;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise((resolve) => {
      finish = resolve;
    });
    const first = cleanupLegacyCloudObject({
      database,
      env,
      remove: async (address) => {
        entered();
        await waiting;
        objects.delete(address);
      },
    });
    await started;
    try {
      await due();
      await cleanupLegacyCloudObject({
        database,
        env,
        remove: async (address) => {
          objects.delete(address);
        },
      });
      const upload = await prepare();
      objects.set(upload.objectKey, 'new content');
      const explicit = await reserveLegacyUploadConfirmation({
        userId: 'owner',
        fileName: 'report.pdf',
        objectKey: upload.objectKey,
        database,
      });
      expect(explicit.objectKey).toBe(upload.objectKey);
      finish();
      await first;
      expect(objects.get(upload.objectKey)).toBe('new content');
      expect((await row()).state).toBe('retired');
    } finally {
      finish();
      await first;
    }
  });
  it('explicit upload keys do not bind concurrent same-name confirmations to another upload', async () => {
    const first = await prepare(),
      second = await prepare();
    for (const upload of [first, second]) {
      expect(
        await reserveLegacyUploadConfirmation({
          userId: 'owner',
          fileName: 'report.pdf',
          objectKey: upload.objectKey,
          database,
        }),
      ).toMatchObject({ objectKey: upload.objectKey, generation: null });
    }
    await expect(
      reserveLegacyUploadConfirmation({
        userId: 'other',
        fileName: 'report.pdf',
        objectKey: first.objectKey,
        database,
      }),
    ).rejects.toMatchObject({ code: 'FILE_UPLOAD_OBJECT_BUSY' });
  });
  it('checks migration contracts and detects a missing due index', async () => {
    const sql = await readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8');
    const checks = sql.slice(
      sql.indexOf("SELECT 'cloud_legacy_lifecycle_schema'"),
      sql.indexOf("SELECT 'cloud_rename_staging_schema'"),
    );
    expect((await database.query(checks))[0].flat()).toEqual([]);
    await database.query('ALTER TABLE cloud_legacy_object_lifecycle DROP INDEX idx_cloud_legacy_due');
    try {
      expect((await database.query(checks))[0].flat()).toEqual([
        { check_name: 'cloud_legacy_lifecycle_contract', detail: 'state/engine/due-index' },
      ]);
    } finally {
      await database.query(
        'ALTER TABLE cloud_legacy_object_lifecycle ADD KEY idx_cloud_legacy_due (available_at,object_hash)',
      );
    }
  });
  it('excludes managed subpaths and never consumes a remote database from a local worker', async () => {
    expect(await queueLegacyObjectRetirement(database, 'owner', 'files/owner/uploads/uuid.pdf')).toBe(false);
    const fake = { query: vi.fn() };
    expect(
      await cleanupLegacyCloudObject({
        database: fake,
        env: { LIGHTNOTE_RUNTIME_ENV: 'local', DB_HOST: 'remote.invalid' },
      }),
    ).toBe(false);
    expect(fake.query).not.toHaveBeenCalled();
  });
});

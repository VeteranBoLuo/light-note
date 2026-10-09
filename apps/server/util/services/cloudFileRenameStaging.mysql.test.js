import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../obsClient.js', () => ({ deleteObjectFromObs: vi.fn() }));
import {
  reserveRenameStage,
  adoptRenameStage,
  releaseRenameStage,
  cleanupRenameStage,
} from './cloudFileRenameStaging.js';
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const env = { LIGHTNOTE_RUNTIME_ENV: 'test' };
const schema = `rename_stage_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socket)('durable rename staging (isolated MySQL)', () => {
  let admin,
    database,
    created = false;
  const stage = () => {
    const id = randomUUID();
    return { id, userId: 'owner', fileId: 1, targetKey: `files/owner/renamed/${id}.pdf` };
  };
  const row = async (id) => (await database.query('SELECT * FROM cloud_file_rename_staging WHERE id=?', [id]))[0][0];
  const due = async (id) => database.query('UPDATE cloud_file_rename_staging SET available_at=NOW() WHERE id=?', [id]);
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
      new URL('../../migrations/20260925_cloud_file_rename_staging.sql', import.meta.url),
      'utf8',
    );
    await database.query(ddl);
    await database.query(ddl);
  });
  beforeEach(async () => {
    await database.query('DELETE FROM cloud_file_rename_staging');
  });
  afterAll(async () => {
    await database?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  it('does not collect an active reservation and adopts it atomically', async () => {
    const item = stage();
    await reserveRenameStage(item, database);
    const remove = vi.fn();
    expect(await cleanupRenameStage({ database, env, remove })).toBe(false);
    const c = await database.getConnection();
    try {
      await c.beginTransaction();
      await adoptRenameStage(c, item);
      await c.commit();
    } finally {
      c.release();
    }
    await releaseRenameStage(item.id, database);
    expect(await row(item.id)).toBeUndefined();
    expect(await cleanupRenameStage({ database, env, remove })).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
  it('rolls adoption back with the file transaction and reclaims a crashed reservation', async () => {
    const item = stage();
    await reserveRenameStage(item, database);
    const c = await database.getConnection();
    try {
      await c.beginTransaction();
      await adoptRenameStage(c, item);
      await c.rollback();
    } finally {
      c.release();
    }
    expect((await row(item.id)).state).toBe('pending');
    await due(item.id);
    const remove = vi.fn();
    expect(await cleanupRenameStage({ database, env, remove })).toBe(true);
    expect(remove).toHaveBeenCalledExactlyOnceWith(item.targetKey);
    expect((await row(item.id)).state).toBe('deleting');
  });
  it('releases connections before deleting and rejects publication after reclamation starts', async () => {
    const item = stage();
    await reserveRenameStage(item, database);
    await releaseRenameStage(item.id, database);
    let active = 0;
    const tracked = {
      query: (...args) => database.query(...args),
      getConnection: async () => {
        const c = await database.getConnection();
        active++;
        return {
          query: (...args) => c.query(...args),
          beginTransaction: () => c.beginTransaction(),
          commit: () => c.commit(),
          rollback: () => c.rollback(),
          release: () => {
            active--;
            c.release();
          },
        };
      },
    };
    const remove = vi.fn(async () => {
      expect(active).toBe(0);
      const c = await database.getConnection();
      try {
        await c.query('SET SESSION innodb_lock_wait_timeout=1');
        await c.beginTransaction();
        await expect(adoptRenameStage(c, item)).rejects.toMatchObject({ code: 'FILE_RENAME_STAGE_EXPIRED' });
        await c.rollback();
      } finally {
        c.release();
      }
    });
    await cleanupRenameStage({ database: tracked, env, remove });
    expect(active).toBe(0);
  });
  it('persists deletion failures and replays deletion for late copies before retiring the tombstone', async () => {
    const item = stage();
    await reserveRenameStage(item, database);
    await due(item.id);
    await expect(
      cleanupRenameStage({
        database,
        env,
        remove: async () => {
          throw Error('temporary storage failure');
        },
      }),
    ).rejects.toThrow('temporary storage failure');
    expect(await row(item.id)).toMatchObject({ state: 'deleting', attempts: 1 });
    const remove = vi.fn();
    expect(await cleanupRenameStage({ database, env, remove })).toBe(false);
    await due(item.id);
    await cleanupRenameStage({ database, env, remove });
    expect(await row(item.id)).toMatchObject({ state: 'deleting', attempts: 2 });
    const [[schedule]] = await database.query(
      'SELECT available_at=DATE_ADD(created_at,INTERVAL 1 DAY) AS deferred FROM cloud_file_rename_staging WHERE id=?',
      [item.id],
    );
    expect(schedule.deferred).toBe(1);
    await database.query(
      'UPDATE cloud_file_rename_staging SET created_at=DATE_SUB(NOW(),INTERVAL 2 DAY),available_at=NOW() WHERE id=?',
      [item.id],
    );
    await cleanupRenameStage({ database, env, remove });
    expect(await row(item.id)).toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('claims each due attempt once across concurrent workers', async () => {
    const item = stage();
    await reserveRenameStage(item, database);
    await due(item.id);
    const remove = vi.fn();
    const results = await Promise.all([
      cleanupRenameStage({ database, env, remove }),
      cleanupRenameStage({ database, env, remove }),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(remove).toHaveBeenCalledOnce();
  });
  it('cleans an adopted journal after API acknowledgement loss without deleting its object', async () => {
    const item = stage();
    await reserveRenameStage(item, database);
    await adoptRenameStage(database, item);
    const remove = vi.fn();
    expect(await cleanupRenameStage({ database, env, remove })).toBe(true);
    expect(await row(item.id)).toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  });
  it('refuses keys outside its generated namespace and respects remote worker ownership', async () => {
    const item = { ...stage(), targetKey: 'files/owner/old.pdf' };
    await expect(reserveRenameStage(item, database)).rejects.toMatchObject({ code: 'FILE_RENAME_STAGE_INVALID' });
    const fake = { getConnection: vi.fn() };
    expect(
      await cleanupRenameStage({ database: fake, env: { LIGHTNOTE_RUNTIME_ENV: 'local', DB_HOST: 'remote.invalid' } }),
    ).toBe(false);
    expect(fake.getConnection).not.toHaveBeenCalled();
  });
  it('checks the new schema contract and detects a missing due index', async () => {
    const assertions = await readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8');
    const start = assertions.indexOf("SELECT 'cloud_rename_staging_schema'");
    expect(start).toBeGreaterThanOrEqual(0);
    const checks = `${assertions.slice(start).split(';').slice(0, 2).join(';')};`;
    const [good] = await database.query(checks);
    expect(good.flat()).toEqual([]);
    await database.query('ALTER TABLE cloud_file_rename_staging DROP INDEX idx_cloud_rename_due');
    const [bad] = await database.query(checks);
    expect(bad.flat()).toEqual([{ check_name: 'cloud_rename_staging_contract', detail: 'state/engine/due-index' }]);
    await database.query('ALTER TABLE cloud_file_rename_staging ADD KEY idx_cloud_rename_due (available_at,id)');
  });
});

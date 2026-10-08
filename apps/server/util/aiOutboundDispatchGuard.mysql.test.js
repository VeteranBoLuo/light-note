import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { acquireAccountAiLifecycleLock, acquireAccountAiLifecycleConnection } from './accountAiLifecycleLock.js';
import { withActiveUserAiDispatch } from './aiOutboundDispatchGuard.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
describe.skipIf(!socketPath)('AI lifecycle barrier (isolated MySQL)', () => {
  const schema = `ai_guard_${randomUUID().replaceAll('-', '')}`;
  const owner = randomUUID();
  let admin,
    database,
    secondInstance,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    const config = { socketPath, user: 'root', database: schema, connectionLimit: 10 };
    database = mysql.createPool(config);
    secondInstance = mysql.createPool(config);
    await database.query(
      'CREATE TABLE user (id varchar(64) PRIMARY KEY, role varchar(20), del_flag int, alias varchar(64))',
    );
    await database.query('INSERT INTO user VALUES (?, "user", 0, "original")', [owner]);
  });
  afterAll(async () => {
    await database?.end();
    await secondInstance?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  it('allows ordinary user-row writes during Provider wait but serializes deletion across pools', async () => {
    const entered = deferred(),
      finish = deferred(),
      deleting = deferred();
    let deletionCommitted = false;
    const dispatch = withActiveUserAiDispatch(database, owner, async () => {
      entered.resolve();
      await finish.promise;
      return 'delivered';
    });
    await entered.promise;
    const connection = await secondInstance.getConnection();
    let deletion;
    try {
      await connection.query('SET SESSION innodb_lock_wait_timeout=1');
      await connection.query('UPDATE user SET alias="ordinary-write" WHERE id=?', [owner]);
      deletion = (async () => {
        deleting.resolve();
        const release = await acquireAccountAiLifecycleLock(connection, owner, { timeoutSeconds: 2 });
        try {
          await connection.beginTransaction();
          await connection.query('UPDATE user SET role="deleted",del_flag=1 WHERE id=?', [owner]);
          await connection.commit();
          deletionCommitted = true;
        } finally {
          await release();
        }
      })();
      await deleting.promise;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(deletionCommitted).toBe(false);
      finish.resolve();
      expect(await dispatch).toBe('delivered');
      await deletion;
      const provider = vi.fn();
      await expect(withActiveUserAiDispatch(database, owner, provider)).rejects.toMatchObject({
        code: 'AI_ACCOUNT_UNAVAILABLE',
      });
      expect(provider).not.toHaveBeenCalled();
    } finally {
      finish.resolve();
      await dispatch.catch(() => {});
      await deletion?.catch(() => {});
      connection.release();
    }
  });
  it('rechecks identity after waiting for a lifecycle mutation and never enters the callback', async () => {
    await database.query('UPDATE user SET role="user",del_flag=0 WHERE id=?', [owner]);
    const connection = await secondInstance.getConnection();
    const release = await acquireAccountAiLifecycleLock(connection, owner, { timeoutSeconds: 2 });
    const provider = vi.fn();
    let dispatch;
    try {
      await connection.beginTransaction();
      await connection.query('UPDATE user SET del_flag=1 WHERE id=?', [owner]);
      dispatch = withActiveUserAiDispatch(database, owner, provider);
      const assertion = expect(dispatch).rejects.toMatchObject({ code: 'AI_ACCOUNT_UNAVAILABLE' });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(provider).not.toHaveBeenCalled();
      await connection.commit();
      await release();
      await assertion;
    } finally {
      await connection.rollback();
      await release();
      await dispatch?.catch(() => {});
      connection.release();
    }
  });
  it('releases both barriers after callback failure and supports callbacks borrowing the same pool', async () => {
    await database.query('UPDATE user SET role="user",del_flag=0,alias="ordinary-write" WHERE id=?', [owner]);
    await expect(
      withActiveUserAiDispatch(database, owner, async ({ connection }) => {
        await connection.query('UPDATE user SET alias="must-rollback" WHERE id=?', [owner]);
        throw new Error('provider failure');
      }),
    ).rejects.toThrow('provider failure');
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        withActiveUserAiDispatch(database, owner, async () => {
          const [[row]] = await database.query('SELECT alias FROM user WHERE id=?', [owner]);
          return row.alias;
        }),
      ),
    );
    expect(results).toEqual(Array(20).fill('ordinary-write'));
  });
  it('a waiting lifecycle mutation leaves its one-slot pool usable', async () => {
    const waitingPool = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 1 });
    const holder = await database.getConnection();
    const release = await acquireAccountAiLifecycleLock(holder, owner);
    const pending = acquireAccountAiLifecycleConnection(waitingPool, owner.toUpperCase());
    let timer;
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const [rows] = await Promise.race([
        waitingPool.query('SELECT 1 AS available'),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('waiting lifecycle consumed pool')), 1000);
        }),
      ]);
      expect(rows[0].available).toBe(1);
    } finally {
      clearTimeout(timer);
      await release();
      holder.release();
      const acquired = await pending;
      await acquired.releaseLifecycle();
      acquired.connection.release();
      await waitingPool.end();
    }
  });
  it('completes twenty distinct accounts on a ten-slot pool with nested callback queries', async () => {
    const ids = Array.from({ length: 20 }, (_, index) => `${owner}-${index}`);
    await database.query('INSERT INTO user (id,role,del_flag) VALUES ?', [ids.map((id) => [id, 'user', 0])]);
    const results = await Promise.all(
      ids.map((id) =>
        withActiveUserAiDispatch(database, id, async () => {
          const [[row]] = await database.query('SELECT id FROM user WHERE id=?', [id]);
          return row.id;
        }),
      ),
    );
    expect(results).toEqual(ids);
  });
});

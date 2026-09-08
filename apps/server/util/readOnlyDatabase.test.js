import { describe, expect, it, vi } from 'vitest';
import { assertReadOnlyQuery, createReadOnlyPool } from './readOnlyDatabase.js';
import { assertDatabaseConnectionSafety } from './databaseConnectionSafety.js';
describe('explicit remote read-only mode', () => {
  it('requires an explicit flag and rejects conflicting read/write flags', () => {
    expect(
      assertDatabaseConnectionSafety({ DB_HOST: 'remote.invalid', ALLOW_REMOTE_DATABASE_READS: 'true' }),
    ).toMatchObject({ readOnly: true, remoteWriteOverride: false });
    expect(() =>
      assertDatabaseConnectionSafety({
        DB_HOST: 'remote.invalid',
        ALLOW_REMOTE_DATABASE_READS: 'true',
        ALLOW_REMOTE_DATABASE_WRITES: 'true',
      }),
    ).toThrow(/不能同时/);
  });
  it('accepts inspection statements, rejects writes, session changes, file exports and multiple statements', () => {
    for (const sql of [
      'SELECT * FROM user WHERE id = ?',
      'SHOW COLUMNS FROM user',
      'DESCRIBE user',
      'EXPLAIN SELECT * FROM user',
      'SELECT 1;',
    ])
      expect(() => assertReadOnlyQuery(sql)).not.toThrow();
    for (const sql of [
      'UPDATE user SET alias = ?',
      'DELETE FROM user',
      'CREATE TABLE x(id INT)',
      'SET SESSION TRANSACTION READ WRITE',
      'CALL repair()',
      'EXPLAIN UPDATE user SET alias = 1',
      "SELECT 1 INTO OUTFILE '/tmp/export'",
      'SELECT * FROM user FOR UPDATE',
      "SELECT GET_LOCK('x',1)",
      'SELECT 1; DELETE FROM user',
      '/*! UPDATE user SET alias=1 */',
      "SELECT 1 /*! INTO OUTFILE '/tmp/x' */",
    ])
      expect(() => assertReadOnlyQuery(sql)).toThrow(/只读/);
  });
  it('initializes each borrowed connection before reading and releases it after failures', async () => {
    const raw = { query: vi.fn().mockResolvedValue([[]]), release: vi.fn(), destroy: vi.fn() };
    const pool = { getConnection: vi.fn().mockResolvedValue(raw), end: vi.fn() };
    const readonly = createReadOnlyPool(pool);
    await readonly.query('SELECT 1');
    expect(raw.query.mock.calls.map(([sql]) => sql)).toEqual(['SET SESSION TRANSACTION READ ONLY', 'SELECT 1']);
    expect(raw.release).toHaveBeenCalledTimes(1);
    await expect(readonly.query('UPDATE user SET alias=1')).rejects.toMatchObject({ code: 'DATABASE_READ_ONLY' });
    expect(pool.getConnection).toHaveBeenCalledTimes(1);
    raw.query.mockRejectedValueOnce(new Error('read-only setup failed'));
    await expect(readonly.query('SELECT 1')).rejects.toThrow('read-only setup failed');
    expect(raw.destroy).toHaveBeenCalledTimes(1);
  });
  it('does not expose raw connections and destroys unreleased read transactions', async () => {
    const raw = {
      query: vi.fn().mockResolvedValue([[]]),
      release: vi.fn(),
      destroy: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const readonly = createReadOnlyPool({ getConnection: vi.fn().mockResolvedValue(raw) });
    const connection = await readonly.getConnection();
    expect(connection.connection).toBeUndefined();
    expect(() => connection.query('DROP TABLE user')).toThrow(/只读/);
    await connection.beginTransaction();
    connection.release();
    expect(raw.query).toHaveBeenCalledWith('START TRANSACTION READ ONLY');
    expect(raw.destroy).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { grantPointsIdempotently } from './pointsGrantOperations.js';

function createGrantConnection() {
  let persistedHash = '';
  let succeeded = false;
  let resultJson = null;
  const query = vi.fn(async (sql, params = []) => {
    const statement = String(sql);
    if (statement.includes('INSERT IGNORE INTO points_grant_operations')) {
      const incomingHash = String(params[3]);
      if (!persistedHash) {
        persistedHash = incomingHash;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    if (statement.includes('FROM points_grant_operations')) {
      return [[{ id: 7, operationHash: persistedHash, status: succeeded ? 'succeeded' : 'pending', resultJson }]];
    }
    if (statement.includes('INSERT INTO user_growth')) return [{ affectedRows: 1 }];
    if (statement.includes('INSERT INTO points_log')) return [{ affectedRows: 1 }];
    if (statement.includes('UPDATE user_growth SET points = points +')) return [{ affectedRows: 1 }];
    if (statement.includes('SELECT points FROM user_growth')) return [[{ points: 135 }]];
    if (statement.includes("UPDATE points_grant_operations\n          SET status = 'succeeded'")) {
      succeeded = true;
      resultJson = params[0];
      return [{ affectedRows: 1 }];
    }
    throw new Error(`未覆盖 SQL: ${statement}`);
  });
  return { query };
}

describe('C5 通用积分发放幂等收据', () => {
  it('相同用户和请求号重放同一结果，不二次写流水或余额', async () => {
    const db = createGrantConnection();
    const payload = {
      userId: 'user-1',
      requestId: 'campaign:pc_test:abc123',
      operationType: 'campaign',
      points: 35,
      reason: 'campaign',
      ref: 'pc_test',
      policyVersion: 'points-earning-c5',
    };
    await expect(grantPointsIdempotently(payload, { db })).resolves.toEqual({ ok: true, granted: 35, balance: 135 });
    await expect(grantPointsIdempotently(payload, { db })).resolves.toEqual({
      ok: true,
      granted: 35,
      balance: 135,
      idempotent: true,
    });
    expect(db.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO points_log'))).toHaveLength(1);
    expect(
      db.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE user_growth SET points = points +')),
    ).toHaveLength(1);
  });

  it('同请求号更换发放数量时失败关闭', async () => {
    const db = createGrantConnection();
    const base = {
      userId: 'user-1',
      requestId: 'campaign:pc_test:abc123',
      operationType: 'campaign',
      points: 35,
      reason: 'campaign',
      ref: 'pc_test',
      policyVersion: 'points-earning-c5',
    };
    await grantPointsIdempotently(base, { db });
    await expect(grantPointsIdempotently({ ...base, points: 50 }, { db })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      status: 409,
    });
  });
});

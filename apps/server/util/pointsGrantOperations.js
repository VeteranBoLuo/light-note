import pool from '../db/index.js';
import { earnPoints } from './points.js';
import { pointsOperationHash } from './pointsOperationHash.js';

export class PointsGrantError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PointsGrantError';
    this.code = code;
    this.status = status;
  }
}

// 兼容既有调用名；底层由无循环依赖的通用工具统一计算。
export const pointsGrantHash = pointsOperationHash;

function parseResult(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Campaign / correction 共用的原子正向发放入口。收据唯一键和余额流水在同一事务；
 * 请求重放返回同一结果，负载冲突失败关闭。
 */
export async function grantPointsIdempotently(
  { userId, requestId, operationType, points, reason, ref = null, policyVersion = null, meta = null },
  { db = null } = {},
) {
  const amount = Math.trunc(Number(points) || 0);
  const normalizedRequestId = String(requestId || '').trim();
  if (!userId || !/^[A-Za-z0-9:_-]{12,96}$/.test(normalizedRequestId) || amount <= 0) {
    throw new PointsGrantError('INVALID_POINTS_GRANT', '积分发放参数无效');
  }
  const payload = { operationType, amount, reason, ref, policyVersion, meta };
  const hash = pointsGrantHash(payload);
  const ownConnection = !db;
  const conn = db || (await pool.getConnection());
  try {
    if (ownConnection) await conn.beginTransaction();
    const [inserted] = await conn.query(
      `INSERT IGNORE INTO points_grant_operations
         (user_id, request_id, operation_type, operation_hash, points, reason, ref, policy_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(userId), normalizedRequestId, operationType, hash, amount, reason, ref, policyVersion],
    );
    const [[operation]] = await conn.query(
      `SELECT id, operation_hash AS operationHash, status, result_json AS resultJson
         FROM points_grant_operations
        WHERE user_id = ? AND request_id = ? LIMIT 1 FOR UPDATE`,
      [String(userId), normalizedRequestId],
    );
    if (!operation || operation.operationHash !== hash) {
      throw new PointsGrantError('IDEMPOTENCY_KEY_REUSED', '请求标识已用于其他发放', 409);
    }
    if (!inserted.affectedRows) {
      const replay = parseResult(operation.resultJson);
      if (operation.status !== 'succeeded' || !replay) {
        throw new PointsGrantError('IDEMPOTENCY_RESULT_PENDING', '原发放仍在处理中', 409);
      }
      if (ownConnection) await conn.commit();
      return { ...replay, idempotent: true };
    }
    await conn.query(
      `INSERT INTO user_growth (user_id) VALUES (?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [String(userId)],
    );
    const granted = await earnPoints(userId, amount, reason, ref, conn, { policyVersion, meta });
    const [[balanceRow]] = await conn.query('SELECT points FROM user_growth WHERE user_id = ? LIMIT 1', [
      String(userId),
    ]);
    const result = { ok: true, granted: granted ? amount : 0, balance: Number(balanceRow?.points || 0) };
    await conn.query(
      `UPDATE points_grant_operations
          SET status = 'succeeded', result_json = ?
        WHERE id = ?`,
      [JSON.stringify(result), operation.id],
    );
    if (ownConnection) await conn.commit();
    return result;
  } catch (error) {
    if (ownConnection) await conn.rollback().catch(() => {});
    throw error;
  } finally {
    if (ownConnection) conn.release();
  }
}

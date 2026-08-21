import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { finishAdminAction } from './adminActionExecution.js';
import { INTERNAL_ROLES } from './internalRoles.js';
import { POINTS_EARNING_POLICY_VERSION } from './pointsEarningPolicy.js';
import { pointsGrantHash, PointsGrantError } from './pointsGrantOperations.js';

function encodeCursor(userId) {
  return Buffer.from(String(userId), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    return Buffer.from(String(cursor), 'base64url').toString('utf8').slice(0, 64) || null;
  } catch {
    return null;
  }
}

export async function getPointsReconciliation(
  { cursor = null, limit = 50, onlyMismatch = true, hideInternal = true } = {},
  { db = pool } = {},
) {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 50)));
  const afterUserId = decodeCursor(cursor);
  // 只看异常时每次最多扫描 500 个账号；先取有序账号页，再对这一小页做两次 GROUP BY。
  // 这样不会为列表中的每一行执行相关子查询，也不会在一个 HTTP 请求里聚合全站流水。
  const scanLimit = onlyMismatch ? Math.min(500, Math.max(100, safeLimit * 5)) : safeLimit;
  const userClauses = [];
  const userParams = [];
  if (afterUserId) {
    userClauses.push('ug.user_id > ?');
    userParams.push(afterUserId);
  }
  if (hideInternal !== false) {
    userClauses.push(`NOT EXISTS (
      SELECT 1 FROM user internal_user
       WHERE internal_user.id = ug.user_id
         AND internal_user.role IN (${INTERNAL_ROLES.map(() => '?').join(',')})
    )`);
    userParams.push(...INTERNAL_ROLES);
  }
  const [users] = await db.query(
    `SELECT ug.user_id AS userId, u.alias, u.email, CAST(ug.points AS SIGNED) AS balance,
            COALESCE(bl.baseline_delta, 0) AS baselineDelta
       FROM user_growth ug
       LEFT JOIN user u ON u.id = ug.user_id
       LEFT JOIN points_ledger_baselines bl ON bl.user_id = ug.user_id
      ${userClauses.length ? `WHERE ${userClauses.join(' AND ')}` : ''}
      ORDER BY ug.user_id ASC
      LIMIT ${scanLimit + 1}`,
    userParams,
  );
  const scannedUsers = users.slice(0, scanLimit);
  if (!scannedUsers.length) {
    return {
      scanned: 0,
      consistent: 0,
      mismatched: 0,
      rows: [],
      nextCursor: null,
      filters: { hideInternal: hideInternal !== false },
    };
  }
  const userIds = scannedUsers.map((row) => String(row.userId));
  const marks = userIds.map(() => '?').join(',');
  const [[ledgerRows], [operationRows]] = await Promise.all([
    db.query(
      `SELECT user_id AS userId, COALESCE(SUM(delta), 0) AS ledgerSum, MAX(create_time) AS latestLedgerAt
         FROM points_log WHERE user_id IN (${marks}) GROUP BY user_id`,
      userIds,
    ),
    db.query(
      `SELECT user_id AS userId, MAX(update_time) AS latestOperationAt
         FROM points_grant_operations WHERE user_id IN (${marks}) GROUP BY user_id`,
      userIds,
    ),
  ]);
  const ledgerByUser = new Map(ledgerRows.map((row) => [String(row.userId), row]));
  const operationByUser = new Map(operationRows.map((row) => [String(row.userId), row]));
  const calculated = scannedUsers.map((row) => {
    const ledger = ledgerByUser.get(String(row.userId));
    const baselineDelta = Number(row.baselineDelta || 0);
    const ledgerSum = Number(ledger?.ledgerSum || 0);
    const expected = baselineDelta + ledgerSum;
    return {
      userId: row.userId,
      alias: row.alias || null,
      email: row.email || null,
      balance: Number(row.balance || 0),
      baselineDelta,
      ledgerSum,
      expected,
      difference: Number(row.balance || 0) - expected,
      latestLedgerAt: ledger?.latestLedgerAt || null,
      latestOperationAt: operationByUser.get(String(row.userId))?.latestOperationAt || null,
    };
  });
  const filtered = onlyMismatch ? calculated.filter((item) => item.difference !== 0) : calculated;
  const hasBufferedMatches = filtered.length > safeLimit;
  const page = filtered.slice(0, safeLimit);
  const hasUnscannedUsers = users.length > scanLimit;
  const cursorUserId = hasBufferedMatches ? page.at(-1)?.userId : scannedUsers.at(-1)?.userId;
  return {
    scanned: scannedUsers.length,
    consistent: calculated.filter((item) => item.difference === 0).length,
    mismatched: calculated.filter((item) => item.difference !== 0).length,
    rows: page,
    nextCursor: hasBufferedMatches || hasUnscannedUsers ? encodeCursor(cursorUserId) : null,
    filters: { hideInternal: hideInternal !== false },
  };
}

export async function applyPointsCorrection(
  userId,
  { expectedDifference = null, delta = null, note = '', requestId = null } = {},
  { actionContext = null, db = pool } = {},
) {
  const clientDifference = Math.trunc(Number(expectedDifference ?? delta) || 0);
  if (!userId || !Number.isSafeInteger(clientDifference) || clientDifference === 0) {
    throw new PointsGrantError('INVALID_CORRECTION', '纠正数量无效');
  }
  const normalizedRequestId = String(requestId || actionContext?.requestId || randomUUID()).slice(0, 96);
  const payload = {
    operationType: 'correction',
    expectedDifference: clientDifference,
    reason: 'correction',
    note: String(note || '').slice(0, 255),
  };
  const hash = pointsGrantHash(payload);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [inserted] = await conn.query(
      `INSERT IGNORE INTO points_grant_operations
         (user_id, request_id, operation_type, operation_hash, points, reason, ref, policy_version)
       VALUES (?, ?, 'correction', ?, ?, 'correction', ?, ?)`,
      [
        String(userId),
        normalizedRequestId,
        hash,
        clientDifference,
        normalizedRequestId.slice(0, 64),
        POINTS_EARNING_POLICY_VERSION,
      ],
    );
    const [[operation]] = await conn.query(
      `SELECT id, operation_hash AS operationHash, status, result_json AS resultJson
         FROM points_grant_operations WHERE user_id = ? AND request_id = ? LIMIT 1 FOR UPDATE`,
      [String(userId), normalizedRequestId],
    );
    if (!operation || operation.operationHash !== hash) {
      throw new PointsGrantError('IDEMPOTENCY_KEY_REUSED', '请求标识已用于其他纠正', 409);
    }
    if (!inserted.affectedRows) {
      if (operation.status !== 'succeeded' || !operation.resultJson) {
        throw new PointsGrantError('IDEMPOTENCY_RESULT_PENDING', '原纠正仍在处理中', 409);
      }
      const receipt = actionContext
        ? await finishAdminAction(actionContext, {
            outcome: 'succeeded',
            metadata: { idempotentReplay: true, originalOperationId: operation.id },
            db: conn,
          })
        : {};
      await conn.commit();
      return {
        ...(typeof operation.resultJson === 'object' ? operation.resultJson : JSON.parse(operation.resultJson)),
        idempotent: true,
        ...receipt,
      };
    }
    const [[growth]] = await conn.query('SELECT points FROM user_growth WHERE user_id = ? FOR UPDATE', [
      String(userId),
    ]);
    if (!growth) throw new PointsGrantError('USER_GROWTH_NOT_FOUND', '目标成长账户不存在', 404);
    const [[ledger]] = await conn.query(
      `SELECT
         COALESCE((SELECT baseline_delta FROM points_ledger_baselines WHERE user_id = ? LIMIT 1), 0) AS baselineDelta,
         COALESCE((SELECT SUM(delta) FROM points_log WHERE user_id = ?), 0) AS ledgerSum`,
      [String(userId), String(userId)],
    );
    const baselineDelta = Number(ledger?.baselineDelta || 0);
    const ledgerSum = Number(ledger?.ledgerSum || 0);
    const balance = Number(growth.points || 0);
    const actualDifference = balance - (baselineDelta + ledgerSum);
    if (actualDifference === 0) throw new PointsGrantError('CORRECTION_NO_LONGER_REQUIRED', '该账户现已对账一致', 409);
    if (actualDifference !== clientDifference) {
      throw new PointsGrantError('CORRECTION_STALE', '账户差额已变化，请刷新后重新确认', 409);
    }
    // correction 补的是缺失的历史流水，不再次改变当前余额。若余额和流水同时增减，
    // 两者差额不会改变，无法完成对账。
    await conn.query(
      `INSERT INTO points_log (user_id, delta, reason, ref, policy_version, meta)
       VALUES (?, ?, 'correction', ?, ?, ?)`,
      [
        String(userId),
        actualDifference,
        normalizedRequestId.slice(0, 64),
        POINTS_EARNING_POLICY_VERSION,
        JSON.stringify({ note: String(note || '').slice(0, 255), mode: 'ledger_history_backfill' }),
      ],
    );
    const result = { ok: true, delta: actualDifference, balance, expectedAfter: balance };
    await conn.query("UPDATE points_grant_operations SET status = 'succeeded', result_json = ? WHERE id = ?", [
      JSON.stringify(result),
      operation.id,
    ]);
    const receipt = actionContext
      ? await finishAdminAction(actionContext, {
          outcome: 'succeeded',
          metadata: { delta: actualDifference, resultingPoints: balance, correctionMode: 'ledger_history_backfill' },
          db: conn,
        })
      : {};
    await conn.commit();
    return { ...result, ...receipt };
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

export const pointsReconciliationInternals = { encodeCursor, decodeCursor };

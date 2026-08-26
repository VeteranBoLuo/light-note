import { createHash } from 'node:crypto';
import pool from '../db/index.js';
import {
  C4_POINTS_ECONOMY_VERSION,
  getEconomyRuntime,
  LEGACY_POINTS_ECONOMY_VERSION,
  POINTS_ECONOMY_VERSION,
} from './pointsEconomyCatalog.js';

export const C4_BACKFILL_MIGRATION_KEY = 'points-economy-c4-paid-pity-v1';
export const C5_STORAGE_LIMIT_MIGRATION_KEY = 'points-economy-c5-storage-limits-v1';
export const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{12,64}$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

export function operationHash(payload) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}

export class PointsEconomyError extends Error {
  constructor(code, message, status = 400, data = {}) {
    super(message);
    this.name = 'PointsEconomyError';
    this.code = code;
    this.status = status;
    this.data = { code, ...data };
  }
}

function normalizeRequestId(value) {
  const requestId = String(value || '').trim();
  if (!requestId) return null;
  if (!CLIENT_REQUEST_ID_PATTERN.test(requestId)) {
    throw new PointsEconomyError('INVALID_CLIENT_REQUEST_ID', '请求标识无效，请刷新后重试');
  }
  return requestId;
}

function parseStoredResult(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new PointsEconomyError('IDEMPOTENCY_RESULT_INVALID', '原请求结果无法回放，请联系客服', 500);
  }
}

export async function beginPointsEconomyOperation(
  conn,
  {
    userId,
    operationType,
    payload,
    clientRequestId,
    economyVersion,
    expectedCost,
    actualCost,
    runtime = getEconomyRuntime(),
  },
) {
  const requestId = normalizeRequestId(clientRequestId);
  const normalizedVersion = String(economyVersion || '').trim() || null;
  const normalizedExpectedCost = expectedCost === undefined || expectedCost === null ? null : Number(expectedCost);
  if (
    normalizedExpectedCost !== null &&
    (!Number.isSafeInteger(normalizedExpectedCost) || normalizedExpectedCost < 0)
  ) {
    throw new PointsEconomyError('INVALID_EXPECTED_COST', '预期价格无效，请刷新后重试');
  }

  if (runtime.requireWriteVersion && (!requestId || !normalizedVersion || normalizedExpectedCost === null)) {
    throw new PointsEconomyError('ECONOMY_CLIENT_UPGRADE_REQUIRED', '积分规则已升级，请刷新页面后重试', 409, {
      economyVersion: runtime.economyVersion,
      refresh: true,
    });
  }

  const hashPayload = {
    operationType,
    economyVersion: normalizedVersion,
    expectedCost: normalizedExpectedCost,
    payload,
  };
  const hash = operationHash(hashPayload);
  let operationId = null;

  // 先读取既有收据：已成功的旧版本请求跨版本重试时仍应原样回放。
  // 此处故意不做 gap-lock；两个首次并发请求都先锁不存在的唯一键会在随后 INSERT 时互相死锁。
  // 唯一索引负责竞争，INSERT IGNORE 后的 FOR UPDATE current read 再读取赢家。
  if (requestId) {
    const [rows] = await conn.query(
      `SELECT id, operation_type, operation_hash, status, result_json
         FROM points_economy_operations
        WHERE user_id = ? AND request_id = ?
        LIMIT 1`,
      [userId, requestId],
    );
    const existing = rows[0];
    if (existing) {
      if (existing.operation_type !== operationType || existing.operation_hash !== hash) {
        throw new PointsEconomyError('IDEMPOTENCY_KEY_REUSED', '该请求标识已用于其他操作，请刷新后重试', 409, {
          economyVersion: runtime.economyVersion,
          refresh: true,
        });
      }
      const replay = parseStoredResult(existing.result_json);
      if (existing.status !== 'succeeded' || !replay) {
        throw new PointsEconomyError('IDEMPOTENCY_RESULT_PENDING', '原请求仍在处理中，请稍后重试', 409);
      }
      await conn.query(
        `UPDATE points_economy_operations
            SET replay_count = replay_count + 1, last_replayed_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [existing.id],
      );
      return { replay: { ...replay, idempotent: true }, operationId: existing.id, requestId, hash };
    }
  }

  if (normalizedVersion && normalizedVersion !== runtime.economyVersion) {
    throw new PointsEconomyError('ECONOMY_CATALOG_CHANGED', '积分规则已更新，请重新确认', 409, {
      economyVersion: runtime.economyVersion,
      refresh: true,
    });
  }
  if (runtime.requireWriteVersion && normalizedVersion !== runtime.economyVersion) {
    throw new PointsEconomyError('ECONOMY_CATALOG_CHANGED', '积分规则已更新，请重新确认', 409, {
      economyVersion: runtime.economyVersion,
      refresh: true,
    });
  }
  if (normalizedExpectedCost !== null && normalizedExpectedCost !== actualCost) {
    throw new PointsEconomyError('ECONOMY_CATALOG_CHANGED', '商品价格已更新，请重新确认', 409, {
      economyVersion: runtime.economyVersion,
      expectedCost: actualCost,
      refresh: true,
    });
  }

  // 只有新请求通过版本与价格校验后才写占位；校验失败回滚时不会留下 pending 孤儿。
  if (requestId) {
    const [inserted] = await conn.query(
      `INSERT IGNORE INTO points_economy_operations
        (user_id, request_id, operation_type, economy_version, operation_hash, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [userId, requestId, operationType, normalizedVersion || runtime.economyVersion, hash],
    );
    if (inserted.affectedRows) {
      operationId = inserted.insertId;
    } else {
      const [rows] = await conn.query(
        `SELECT id, operation_type, operation_hash, status, result_json
           FROM points_economy_operations
          WHERE user_id = ? AND request_id = ?
          LIMIT 1 FOR UPDATE`,
        [userId, requestId],
      );
      const raced = rows[0];
      if (!raced || raced.operation_type !== operationType || raced.operation_hash !== hash) {
        throw new PointsEconomyError('IDEMPOTENCY_KEY_REUSED', '该请求标识已用于其他操作，请刷新后重试', 409, {
          economyVersion: runtime.economyVersion,
          refresh: true,
        });
      }
      const replay = parseStoredResult(raced.result_json);
      if (raced.status !== 'succeeded' || !replay) {
        throw new PointsEconomyError('IDEMPOTENCY_RESULT_PENDING', '原请求仍在处理中，请稍后重试', 409);
      }
      await conn.query(
        `UPDATE points_economy_operations
            SET replay_count = replay_count + 1, last_replayed_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [raced.id],
      );
      return { replay: { ...replay, idempotent: true }, operationId: raced.id, requestId, hash };
    }
  }

  return { replay: null, operationId, requestId, hash };
}

export async function completePointsEconomyOperation(conn, context, result) {
  if (!context?.operationId) return;
  const rewards = Array.isArray(result?.results) ? result.results : [];
  const effect = result?.effect || {};
  const costPoints = Math.max(0, Math.trunc(Number(result?.cost) || 0));
  const pointsRewarded = rewards.reduce(
    (sum, reward) => sum + (reward?.kind === 'points' ? Math.max(0, Math.trunc(Number(reward.amount) || 0)) : 0),
    0,
  );
  const aiTokensGranted =
    rewards.reduce(
      (sum, reward) => sum + (reward?.kind === 'ai_pack' ? Math.max(0, Math.trunc(Number(reward.amount) || 0)) : 0),
      0,
    ) + (effect.type === 'ai_pack' ? Math.max(0, Math.trunc(Number(effect.amountTokens) || 0)) : 0);
  const storageMbGranted =
    rewards.reduce(
      (sum, reward) => sum + (reward?.kind === 'storage' ? Math.max(0, Math.trunc(Number(reward.amount) || 0)) : 0),
      0,
    ) + (effect.type === 'storage' ? Math.max(0, Math.trunc(Number(effect.amountMb) || 0)) : 0);
  const makeupCardsGranted = rewards.reduce(
    (sum, reward) => sum + (reward?.kind === 'card' ? Math.max(0, Math.trunc(Number(reward.amount) || 0)) : 0),
    0,
  );
  await conn.query(
    `UPDATE points_economy_operations
        SET status = 'succeeded', result_json = ?, item_id = ?, cost_points = ?, points_rewarded = ?,
            ai_tokens_granted = ?, storage_mb_granted = ?, makeup_cards_granted = ?, draw_count = ?, pity_hits = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [
      JSON.stringify(result),
      result?.itemId || null,
      costPoints,
      pointsRewarded,
      aiTokensGranted,
      storageMbGranted,
      makeupCardsGranted,
      rewards.length,
      Array.isArray(result?.pityHitIndexes) ? result.pityHitIndexes.length : 0,
      context.operationId,
    ],
  );
}

export async function assertPointsEconomyActivationReady({ db = pool, runtime = getEconomyRuntime() } = {}) {
  if (runtime.economyVersion === LEGACY_POINTS_ECONOMY_VERSION) return true;
  const [rows] = await db.query('SELECT 1 FROM points_economy_migration_state WHERE migration_key = ? LIMIT 1', [
    C4_BACKFILL_MIGRATION_KEY,
  ]);
  if (!rows.length) {
    const error = new Error('POINTS_ECONOMY_C4_MIGRATION_REQUIRED');
    error.code = 'POINTS_ECONOMY_C4_MIGRATION_REQUIRED';
    throw error;
  }
  if (runtime.economyVersion === C4_POINTS_ECONOMY_VERSION) return true;
  if (runtime.economyVersion !== POINTS_ECONOMY_VERSION) {
    const error = new Error('POINTS_ECONOMY_VERSION_UNSUPPORTED');
    error.code = 'POINTS_ECONOMY_VERSION_UNSUPPORTED';
    throw error;
  }
  const [storageLimitRows] = await db.query(
    'SELECT 1 FROM points_economy_migration_state WHERE migration_key = ? LIMIT 1',
    [C5_STORAGE_LIMIT_MIGRATION_KEY],
  );
  if (!storageLimitRows.length) {
    const error = new Error('POINTS_ECONOMY_C5_MIGRATION_REQUIRED');
    error.code = 'POINTS_ECONOMY_C5_MIGRATION_REQUIRED';
    throw error;
  }
  return true;
}

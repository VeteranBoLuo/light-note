import pool from '../db/index.js';

export const AI_BONUS_WALLET_POLICY_VERSION = 'ai-bonus-wallet-v1';

export const AI_BONUS_WALLET_TABLE_SQL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS ai_bonus_wallet_state (
    policy_version varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    baseline_completed_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (policy_version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS ai_bonus_ledger (
    id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    entry_type varchar(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount_tokens bigint unsigned NOT NULL,
    balance_after bigint unsigned NOT NULL,
    source_type varchar(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_ref varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    idempotency_key varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    idempotency_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    policy_version varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ai_bonus_ledger_idempotency (idempotency_hash),
    KEY idx_ai_bonus_ledger_user_time (user_id, create_time, id),
    KEY idx_ai_bonus_ledger_source (source_type, source_ref, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS ai_bonus_lots (
    id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    credit_ledger_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_type varchar(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_ref varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    policy_version varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_tokens bigint unsigned NOT NULL,
    remaining_tokens bigint unsigned NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ai_bonus_lot_credit (credit_ledger_id),
    KEY idx_ai_bonus_lots_user_remaining (user_id, remaining_tokens, create_time, id),
    KEY idx_ai_bonus_lots_source (source_type, source_ref, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS ai_bonus_lot_allocations (
    id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    debit_ledger_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    lot_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount_tokens bigint unsigned NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ai_bonus_allocation_debit_lot (debit_ledger_id, lot_id),
    KEY idx_ai_bonus_allocation_user_time (user_id, create_time, id),
    KEY idx_ai_bonus_allocation_lot (lot_id, create_time),
    KEY idx_ai_bonus_allocation_debit (debit_ledger_id, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]);

export const AI_BONUS_WALLET_BASELINE_SQL = Object.freeze([
  `INSERT IGNORE INTO ai_bonus_wallet_state (policy_version, baseline_completed_at)
   VALUES (?, NULL)`,
  `SELECT baseline_completed_at
     FROM ai_bonus_wallet_state
    WHERE policy_version = ?
    LIMIT 1
    FOR UPDATE`,
  `INSERT IGNORE INTO ai_bonus_ledger
    (id, user_id, entry_type, amount_tokens, balance_after, source_type, source_ref,
     idempotency_key, idempotency_hash, policy_version)
   SELECT UUID(), ug.user_id, 'credit', ug.ai_bonus_tokens, ug.ai_bonus_tokens,
          'legacy_baseline', 'user_growth', 'legacy-baseline-v1',
          SHA2(CONCAT('v1', CHAR(0), ug.user_id, CHAR(0), 'legacy-baseline-v1'), 256), ?
     FROM user_growth ug
    WHERE ug.ai_bonus_tokens > 0
      AND NOT EXISTS (
        SELECT 1 FROM ai_bonus_ledger existing WHERE existing.user_id = ug.user_id
      )`,
  `INSERT IGNORE INTO ai_bonus_lots
    (id, user_id, credit_ledger_id, source_type, source_ref, policy_version,
     original_tokens, remaining_tokens, create_time)
   SELECT UUID(), l.user_id, l.id, l.source_type, l.source_ref, l.policy_version,
          l.amount_tokens, l.amount_tokens, l.create_time
     FROM ai_bonus_ledger l
    WHERE l.source_type = 'legacy_baseline'
      AND l.entry_type = 'credit'`,
  `UPDATE ai_bonus_wallet_state
      SET baseline_completed_at = NOW()
    WHERE policy_version = ?
      AND baseline_completed_at IS NULL`,
]);

let ensurePromise;

/**
 * 在 HTTP 监听前创建永久额度账本，并把既有余额登记成单一历史期初批次。
 * INSERT IGNORE 只补缺失事实，不改变任何用户的 user_growth 余额。
 */
export function ensureAiBonusWalletSchema({ db = pool } = {}) {
  if (!ensurePromise || db !== pool) {
    const promise = (async () => {
      for (const sql of AI_BONUS_WALLET_TABLE_SQL) await db.query(sql);
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(AI_BONUS_WALLET_BASELINE_SQL[0], [AI_BONUS_WALLET_POLICY_VERSION]);
        const [rows] = await connection.query(AI_BONUS_WALLET_BASELINE_SQL[1], [AI_BONUS_WALLET_POLICY_VERSION]);
        if (!rows[0]?.baseline_completed_at) {
          await connection.query(AI_BONUS_WALLET_BASELINE_SQL[2], [AI_BONUS_WALLET_POLICY_VERSION]);
          await connection.query(AI_BONUS_WALLET_BASELINE_SQL[3]);
          await connection.query(AI_BONUS_WALLET_BASELINE_SQL[4], [AI_BONUS_WALLET_POLICY_VERSION]);
        }
        await connection.commit();
      } catch (error) {
        try {
          await connection.rollback();
        } catch {
          // 保留原始初始化错误。
        }
        throw error;
      } finally {
        connection.release();
      }
    })();
    if (db === pool) {
      ensurePromise = promise.catch((error) => {
        ensurePromise = undefined;
        throw error;
      });
    } else {
      return promise;
    }
  }
  return ensurePromise;
}

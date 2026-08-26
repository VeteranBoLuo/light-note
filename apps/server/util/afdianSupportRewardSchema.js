import { AFDIAN_AI_REWARD_POLICY, AFDIAN_PURE_SUPPORT_POLICY } from '@lightnote/shared';
import pool from '../db/index.js';

export const AFDIAN_SUPPORT_REWARD_TABLE_SQL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS support_reward_policy_state (
    policy_version varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tokens_per_cny bigint unsigned NOT NULL,
    auto_credit_max_amount decimal(12,2) unsigned NOT NULL,
    activated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (policy_version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS support_reward_grants (
    id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    support_order_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    policy_version varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    paid_amount decimal(12,2) unsigned NOT NULL,
    calculated_tokens bigint unsigned NOT NULL,
    granted_tokens bigint unsigned NOT NULL DEFAULT 0,
    grant_status varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reason_code varchar(48) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    ledger_entry_id char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    reviewed_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    reviewed_at datetime DEFAULT NULL,
    credited_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_support_reward_order (support_order_id),
    UNIQUE KEY uk_support_reward_ledger (ledger_entry_id),
    KEY idx_support_reward_user_time (user_id, create_time, id),
    KEY idx_support_reward_status_time (grant_status, update_time, id),
    KEY idx_support_reward_policy (policy_version, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]);

let ensurePromise;
const SUPPORT_REWARD_POLICIES = Object.freeze([AFDIAN_AI_REWARD_POLICY, AFDIAN_PURE_SUPPORT_POLICY]);

/**
 * 策略版本首次写入时间就是该版本的生效边界。INSERT IGNORE 保证重启不会移动边界；
 * 同版本配置发生漂移时失败关闭，要求以新版本发布，避免旧订单被新倍率重新解释。
 */
export function ensureAfdianSupportRewardSchema({ db = pool } = {}) {
  if (!ensurePromise || db !== pool) {
    const promise = (async () => {
      for (const sql of AFDIAN_SUPPORT_REWARD_TABLE_SQL) await db.query(sql);
      for (const policy of SUPPORT_REWARD_POLICIES) {
        await db.query(
          `INSERT IGNORE INTO support_reward_policy_state
            (policy_version, tokens_per_cny, auto_credit_max_amount)
           VALUES (?, ?, ?)`,
          [policy.version, policy.tokensPerCny, policy.autoCreditMaxAmount],
        );
        const [rows] = await db.query(
          `SELECT tokens_per_cny, auto_credit_max_amount
             FROM support_reward_policy_state
            WHERE policy_version = ?
            LIMIT 1`,
          [policy.version],
        );
        const persisted = rows[0];
        if (
          !persisted ||
          Number(persisted.tokens_per_cny) !== policy.tokensPerCny ||
          Number(persisted.auto_credit_max_amount) !== policy.autoCreditMaxAmount
        ) {
          const error = new Error('爱发电支持策略版本与数据库配置不一致');
          error.code = 'AFDIAN_REWARD_POLICY_VERSION_CONFLICT';
          throw error;
        }
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

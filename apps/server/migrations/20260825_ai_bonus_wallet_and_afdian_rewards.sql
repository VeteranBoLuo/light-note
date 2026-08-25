-- 永久 AI 额度统一账本 + 爱发电实付赠送策略。
-- MySQL 5.7 兼容，可重复执行；首次执行时间固定为 support-ai-v1 的生效边界。

CREATE TABLE IF NOT EXISTS `ai_bonus_wallet_state` (
  `policy_version` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `baseline_completed_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`policy_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 旧系统把已有 root 强制显示为 Lv.15，但不记经验；新 AI 额度改为读真实经验后，
-- 会导致「资料卡 Lv.15，配额却按 Lv.1」。迁移时把历史虚拟权益一次性固化到真实账本，
-- 然后所有角色都可以共用 levelForExp(exp) 这一事实源。新增/后续转为 root 的账号不会自动满级。
START TRANSACTION;

INSERT IGNORE INTO `ai_bonus_wallet_state` (`policy_version`,`baseline_completed_at`)
VALUES ('root-real-rank-v1', NULL);

SELECT `baseline_completed_at` INTO @root_rank_materialized_at
  FROM `ai_bonus_wallet_state`
 WHERE `policy_version`='root-real-rank-v1'
 LIMIT 1
 FOR UPDATE;

SET @root_rank_materialization_pending := IF(@root_rank_materialized_at IS NULL, 1, 0);

INSERT IGNORE INTO `growth_events`
  (`user_id`,`source`,`ref_id`,`day`,`amount`,`status`,`meta`)
SELECT u.id, 'manual', 'root-level-materialization-v1', NULL,
       GREATEST(0, 50000 - COALESCE(ug.exp, 0)), 'granted',
       JSON_OBJECT('policyVersion', 'root-real-rank-v1', 'legacyVirtualLevel', 15)
  FROM `user` u
 LEFT JOIN `user_growth` ug ON BINARY ug.user_id = BINARY u.id
 WHERE @root_rank_materialization_pending=1
   AND u.role = 'root'
   AND COALESCE(u.del_flag, 0) = 0;

INSERT INTO `user_growth` (`user_id`,`exp`,`level`,`last_notified_level`)
SELECT u.id, 50000, 15, 15
  FROM `user` u
 WHERE @root_rank_materialization_pending=1
   AND u.role = 'root'
   AND COALESCE(u.del_flag, 0) = 0
ON DUPLICATE KEY UPDATE
  `exp` = GREATEST(`exp`, VALUES(`exp`)),
  `level` = GREATEST(`level`, VALUES(`level`)),
  `last_notified_level` = GREATEST(`last_notified_level`, VALUES(`last_notified_level`));

UPDATE `ai_bonus_wallet_state`
   SET `baseline_completed_at`=NOW()
 WHERE `policy_version`='root-real-rank-v1'
   AND @root_rank_materialization_pending=1
   AND `baseline_completed_at` IS NULL;

COMMIT;

CREATE TABLE IF NOT EXISTS `ai_bonus_ledger` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `entry_type` varchar(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `amount_tokens` bigint unsigned NOT NULL,
  `balance_after` bigint unsigned NOT NULL,
  `source_type` varchar(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_ref` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `idempotency_key` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `idempotency_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `policy_version` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_bonus_ledger_idempotency` (`idempotency_hash`),
  KEY `idx_ai_bonus_ledger_user_time` (`user_id`,`create_time`,`id`),
  KEY `idx_ai_bonus_ledger_source` (`source_type`,`source_ref`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_bonus_lots` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `credit_ledger_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_type` varchar(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_ref` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_version` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `original_tokens` bigint unsigned NOT NULL,
  `remaining_tokens` bigint unsigned NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_bonus_lot_credit` (`credit_ledger_id`),
  KEY `idx_ai_bonus_lots_user_remaining` (`user_id`,`remaining_tokens`,`create_time`,`id`),
  KEY `idx_ai_bonus_lots_source` (`source_type`,`source_ref`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_bonus_lot_allocations` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `debit_ledger_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `lot_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `amount_tokens` bigint unsigned NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_bonus_allocation_debit_lot` (`debit_ledger_id`,`lot_id`),
  KEY `idx_ai_bonus_allocation_user_time` (`user_id`,`create_time`,`id`),
  KEY `idx_ai_bonus_allocation_lot` (`lot_id`,`create_time`),
  KEY `idx_ai_bonus_allocation_debit` (`debit_ledger_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 只在钱包首次激活时登记既有余额；重跑不能把新钱包余额再次当作期初资产。
START TRANSACTION;

INSERT IGNORE INTO `ai_bonus_wallet_state` (`policy_version`,`baseline_completed_at`)
VALUES ('ai-bonus-wallet-v1', NULL);

SELECT `baseline_completed_at` INTO @ai_bonus_baseline_completed_at
  FROM `ai_bonus_wallet_state`
 WHERE `policy_version`='ai-bonus-wallet-v1'
 LIMIT 1
 FOR UPDATE;

SET @ai_bonus_baseline_pending := IF(@ai_bonus_baseline_completed_at IS NULL, 1, 0);

INSERT IGNORE INTO `ai_bonus_ledger`
  (`id`,`user_id`,`entry_type`,`amount_tokens`,`balance_after`,`source_type`,`source_ref`,
   `idempotency_key`,`idempotency_hash`,`policy_version`)
SELECT UUID(), ug.user_id, 'credit', ug.ai_bonus_tokens, ug.ai_bonus_tokens,
       'legacy_baseline', 'user_growth', 'legacy-baseline-v1',
       SHA2(CONCAT('v1', CHAR(0), ug.user_id, CHAR(0), 'legacy-baseline-v1'), 256),
       'ai-bonus-wallet-v1'
 FROM user_growth ug
 WHERE @ai_bonus_baseline_pending=1
   AND ug.ai_bonus_tokens > 0
   AND NOT EXISTS (
     SELECT 1 FROM ai_bonus_ledger existing WHERE existing.user_id=ug.user_id
   );

INSERT IGNORE INTO `ai_bonus_lots`
  (`id`,`user_id`,`credit_ledger_id`,`source_type`,`source_ref`,`policy_version`,
   `original_tokens`,`remaining_tokens`,`create_time`)
SELECT UUID(), l.user_id, l.id, l.source_type, l.source_ref, l.policy_version,
       l.amount_tokens, l.amount_tokens, l.create_time
 FROM ai_bonus_ledger l
 WHERE @ai_bonus_baseline_pending=1
   AND l.source_type='legacy_baseline'
   AND l.entry_type='credit';

UPDATE `ai_bonus_wallet_state`
   SET `baseline_completed_at`=NOW()
 WHERE `policy_version`='ai-bonus-wallet-v1'
   AND @ai_bonus_baseline_pending=1
   AND `baseline_completed_at` IS NULL;

COMMIT;

SET @support_provider_created_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='support_orders' AND COLUMN_NAME='provider_created_at'
);
SET @support_provider_created_ddl := IF(
  @support_provider_created_exists = 0,
  'ALTER TABLE `support_orders` ADD COLUMN `provider_created_at` datetime DEFAULT NULL AFTER `provider_status`',
  'SELECT 1'
);
PREPARE stmt FROM @support_provider_created_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `support_reward_policy_state` (
  `policy_version` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tokens_per_cny` bigint unsigned NOT NULL,
  `auto_credit_max_amount` decimal(12,2) unsigned NOT NULL,
  `activated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`policy_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_reward_grants` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `support_order_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `policy_version` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `paid_amount` decimal(12,2) unsigned NOT NULL,
  `calculated_tokens` bigint unsigned NOT NULL,
  `granted_tokens` bigint unsigned NOT NULL DEFAULT 0,
  `grant_status` varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reason_code` varchar(48) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `ledger_entry_id` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `reviewed_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `credited_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_support_reward_order` (`support_order_id`),
  UNIQUE KEY `uk_support_reward_ledger` (`ledger_entry_id`),
  KEY `idx_support_reward_user_time` (`user_id`,`create_time`,`id`),
  KEY `idx_support_reward_status_time` (`grant_status`,`update_time`,`id`),
  KEY `idx_support_reward_policy` (`policy_version`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `support_reward_policy_state`
  (`policy_version`,`tokens_per_cny`,`auto_credit_max_amount`)
VALUES ('support-ai-v1', 100000, 200.00);

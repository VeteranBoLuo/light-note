-- 爱发电常驻/活动套餐、每 SKU 首充资格与 AI/空间通用权益账本。
-- MySQL 5.7 兼容，可重复执行；功能开关默认关闭，迁移本身不会发放权益。

DROP PROCEDURE IF EXISTS `ensure_support_package_column`;
DELIMITER $$
CREATE PROCEDURE `ensure_support_package_column`(
  IN p_table_name varchar(64),
  IN p_column_name varchar(64),
  IN p_definition text
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME=p_table_name
       AND COLUMN_NAME=p_column_name
  ) THEN
    SET @support_package_ddl = CONCAT(
      'ALTER TABLE `', p_table_name, '` ADD COLUMN `', p_column_name, '` ', p_definition
    );
    PREPARE support_package_stmt FROM @support_package_ddl;
    EXECUTE support_package_stmt;
    DEALLOCATE PREPARE support_package_stmt;
  END IF;
END$$
DELIMITER ;

CALL `ensure_support_package_column`('support_checkout_intents', 'intent_type',
  'varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''legacy'' AFTER `option_key`');
CALL `ensure_support_package_column`('support_checkout_intents', 'intent_status',
  'varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''issued'' AFTER `intent_type`');
CALL `ensure_support_package_column`('support_checkout_intents', 'sku_id',
  'varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `intent_status`');
CALL `ensure_support_package_column`('support_checkout_intents', 'catalog_version',
  'varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `sku_id`');
CALL `ensure_support_package_column`('support_checkout_intents', 'quoted_amount',
  'decimal(12,2) unsigned DEFAULT NULL AFTER `catalog_version`');
CALL `ensure_support_package_column`('support_checkout_intents', 'base_ai_tokens',
  'bigint unsigned NOT NULL DEFAULT 0 AFTER `quoted_amount`');
CALL `ensure_support_package_column`('support_checkout_intents', 'base_storage_mb',
  'int unsigned NOT NULL DEFAULT 0 AFTER `base_ai_tokens`');
CALL `ensure_support_package_column`('support_checkout_intents', 'quoted_ai_tokens',
  'bigint unsigned NOT NULL DEFAULT 0 AFTER `base_storage_mb`');
CALL `ensure_support_package_column`('support_checkout_intents', 'quoted_storage_mb',
  'int unsigned NOT NULL DEFAULT 0 AFTER `quoted_ai_tokens`');
CALL `ensure_support_package_column`('support_checkout_intents', 'first_purchase_candidate',
  'tinyint unsigned NOT NULL DEFAULT 0 AFTER `quoted_storage_mb`');
CALL `ensure_support_package_column`('support_checkout_intents', 'campaign_id',
  'char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `first_purchase_candidate`');
CALL `ensure_support_package_column`('support_checkout_intents', 'campaign_sku_id',
  'char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `campaign_id`');
CALL `ensure_support_package_column`('support_checkout_intents', 'campaign_version',
  'int unsigned DEFAULT NULL AFTER `campaign_sku_id`');
CALL `ensure_support_package_column`('support_checkout_intents', 'campaign_user_limit',
  'smallint unsigned DEFAULT NULL AFTER `campaign_version`');
CALL `ensure_support_package_column`('support_checkout_intents', 'campaign_starts_at',
  'datetime DEFAULT NULL AFTER `campaign_user_limit`');
CALL `ensure_support_package_column`('support_checkout_intents', 'campaign_ends_at',
  'datetime DEFAULT NULL AFTER `campaign_starts_at`');
CALL `ensure_support_package_column`('support_checkout_intents', 'consumed_order_id',
  'char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `first_used_at`');

DROP PROCEDURE `ensure_support_package_column`;

DROP PROCEDURE IF EXISTS `ensure_support_package_index`;
DELIMITER $$
CREATE PROCEDURE `ensure_support_package_index`(
  IN p_table_name varchar(64),
  IN p_index_name varchar(64),
  IN p_definition text
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME=p_table_name
       AND INDEX_NAME=p_index_name
  ) THEN
    SET @support_package_ddl = CONCAT('ALTER TABLE `', p_table_name, '` ADD ', p_definition);
    PREPARE support_package_stmt FROM @support_package_ddl;
    EXECUTE support_package_stmt;
    DEALLOCATE PREPARE support_package_stmt;
  END IF;
END$$
DELIMITER ;

CALL `ensure_support_package_index`('support_checkout_intents', 'idx_support_checkout_package',
  'KEY `idx_support_checkout_package` (`intent_type`,`sku_id`,`user_id`,`create_time`)');
CALL `ensure_support_package_index`('support_checkout_intents', 'idx_support_checkout_consumed',
  'KEY `idx_support_checkout_consumed` (`consumed_order_id`)');

DROP PROCEDURE `ensure_support_package_index`;

CREATE TABLE IF NOT EXISTS `support_campaigns` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_key` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `version` int unsigned NOT NULL,
  `title` varchar(120) NOT NULL,
  `description` varchar(500) NOT NULL DEFAULT '',
  `status` varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft',
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `cost_policy_version` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `published_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `published_at` datetime DEFAULT NULL,
  `suspended_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `suspended_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_support_campaign_version` (`campaign_key`,`version`),
  KEY `idx_support_campaign_public` (`status`,`starts_at`,`ends_at`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_campaign_skus` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sku_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` varchar(80) NOT NULL,
  `category` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `amount` decimal(12,2) unsigned NOT NULL,
  `ai_tokens` bigint unsigned NOT NULL DEFAULT 0,
  `storage_mb` int unsigned NOT NULL DEFAULT 0,
  `per_user_limit` smallint unsigned NOT NULL DEFAULT 1,
  `margin_bps` int NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_support_campaign_sku_version` (`campaign_id`,`sku_id`),
  KEY `idx_support_campaign_sku_campaign` (`campaign_id`,`sort_order`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 早期开发版本曾把 sku_id 做成跨活动全局唯一，会阻止新活动版本沿用同一个通俗套餐名。
-- 统一收敛为“活动版本 + 套餐名”唯一；该过程可重复执行。
DROP PROCEDURE IF EXISTS `ensure_support_campaign_sku_version_index`;
DELIMITER $$
CREATE PROCEDURE `ensure_support_campaign_sku_version_index`()
BEGIN
  DECLARE v_columns varchar(255) DEFAULT NULL;
  DECLARE v_non_unique int DEFAULT NULL;

  IF EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='support_campaign_skus'
       AND INDEX_NAME='uk_support_campaign_sku_public'
  ) THEN
    ALTER TABLE `support_campaign_skus` DROP INDEX `uk_support_campaign_sku_public`;
  END IF;

  SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX), MIN(NON_UNIQUE)
    INTO v_columns, v_non_unique
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='support_campaign_skus'
     AND INDEX_NAME='uk_support_campaign_sku_version';

  IF v_columns IS NOT NULL
     AND (v_columns<>'campaign_id,sku_id' OR v_non_unique<>0) THEN
    ALTER TABLE `support_campaign_skus` DROP INDEX `uk_support_campaign_sku_version`;
    SET v_columns = NULL;
  END IF;

  IF v_columns IS NULL THEN
    ALTER TABLE `support_campaign_skus`
      ADD UNIQUE KEY `uk_support_campaign_sku_version` (`campaign_id`,`sku_id`);
  END IF;
END$$
DELIMITER ;

CALL `ensure_support_campaign_sku_version_index`();
DROP PROCEDURE `ensure_support_campaign_sku_version_index`;

CREATE TABLE IF NOT EXISTS `support_campaign_user_limits` (
  `campaign_sku_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `completed_count` smallint unsigned NOT NULL DEFAULT 0,
  `active_intent_id` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `active_until` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`campaign_sku_id`,`user_id`),
  UNIQUE KEY `uk_support_campaign_active_intent` (`active_intent_id`),
  KEY `idx_support_campaign_limit_user` (`user_id`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_first_purchase_claims` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `provider_identity_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sku_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `support_order_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_support_first_user_sku` (`user_id`,`sku_id`),
  UNIQUE KEY `uk_support_first_identity_sku` (`provider_identity_hash`,`sku_id`),
  UNIQUE KEY `uk_support_first_order` (`support_order_id`),
  KEY `idx_support_first_sku_time` (`sku_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_entitlement_grants` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `support_order_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `checkout_intent_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `entitlement_type` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sku_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `catalog_version` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_id` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `campaign_sku_id` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `campaign_version` int unsigned DEFAULT NULL,
  `paid_amount` decimal(12,2) unsigned NOT NULL,
  `calculated_ai_tokens` bigint unsigned NOT NULL DEFAULT 0,
  `calculated_storage_mb` int unsigned NOT NULL DEFAULT 0,
  `granted_ai_tokens` bigint unsigned NOT NULL DEFAULT 0,
  `granted_storage_mb` int unsigned NOT NULL DEFAULT 0,
  `first_purchase_applied` tinyint unsigned NOT NULL DEFAULT 0,
  `grant_status` varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reason_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `ai_ledger_entry_id` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `storage_log_ref` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `reviewed_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `credited_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_support_entitlement_order` (`support_order_id`),
  UNIQUE KEY `uk_support_entitlement_ai_ledger` (`ai_ledger_entry_id`),
  KEY `idx_support_entitlement_intent` (`checkout_intent_id`,`create_time`),
  KEY `idx_support_entitlement_user_time` (`user_id`,`create_time`,`id`),
  KEY `idx_support_entitlement_status_time` (`grant_status`,`update_time`,`id`),
  KEY `idx_support_entitlement_sku_time` (`entitlement_type`,`sku_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

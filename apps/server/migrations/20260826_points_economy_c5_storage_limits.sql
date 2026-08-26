-- 积分经济 C5：保留 C4 价格与奖池，把三档永久空间改为每账号各限兑一次。
-- MySQL 5.7 兼容、可重复执行；历史直接兑换计入资格，抽奖与运营赠送不计入。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS points_shop_item_claims (
  user_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  source_economy_version VARCHAR(32) DEFAULT NULL,
  operation_id BIGINT DEFAULT NULL,
  claim_source VARCHAR(24) NOT NULL DEFAULT 'purchase',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id),
  UNIQUE KEY uk_points_shop_claim_operation (operation_id),
  KEY idx_points_shop_claim_item_time (item_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分商店有限次商品领取事实';

START TRANSACTION;

-- 收据优先：取每个账号每一档最早的成功购买，保留与该行一致的版本、操作 ID 和时间。
-- INSERT IGNORE 使脚本可安全重跑，也能补齐首次执行后才同步回来的历史收据。
INSERT IGNORE INTO points_shop_item_claims
  (user_id, item_id, source_economy_version, operation_id, claim_source, create_time)
SELECT receipt.user_id,
       receipt.item_id,
       receipt.economy_version,
       receipt.id,
       'operation_backfill',
       receipt.create_time
  FROM points_economy_operations receipt
  JOIN (
    SELECT user_id, item_id, MIN(id) AS first_operation_id
      FROM points_economy_operations
     WHERE status = 'succeeded'
       AND operation_type = 'shop_buy'
       AND item_id IN ('storage_128', 'storage_512', 'storage_2g')
     GROUP BY user_id, item_id
  ) first_receipt ON first_receipt.first_operation_id = receipt.id;

-- C4 收据上线前的购买只存在于 points_log；同一档历史买过多次也只占一个“一次兑换”资格。
INSERT IGNORE INTO points_shop_item_claims
  (user_id, item_id, source_economy_version, operation_id, claim_source, create_time)
SELECT ledger.user_id,
       ledger.ref,
       NULL,
       NULL,
       'ledger_backfill',
       MIN(ledger.create_time)
  FROM points_log ledger
 WHERE ledger.reason = 'buy'
   AND ledger.ref IN ('storage_128', 'storage_512', 'storage_2g')
 GROUP BY ledger.user_id, ledger.ref;

INSERT IGNORE INTO points_economy_migration_state (migration_key, meta)
VALUES (
  'points-economy-c5-storage-limits-v1',
  JSON_OBJECT(
    'catalogVersion', 'points-economy-c5',
    'purchaseLimit', 1,
    'historicalSources', JSON_ARRAY('points_economy_operations', 'points_log'),
    'completedBy', '20260826_points_economy_c5_storage_limits.sql'
  )
);

COMMIT;

SELECT migration_key, completed_at
  FROM points_economy_migration_state
 WHERE migration_key = 'points-economy-c5-storage-limits-v1';

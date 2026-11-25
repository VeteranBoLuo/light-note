-- C5 的每条领取事实代表一次兑换（含已回填的历史兑换）。保留首笔来源与收据引用。
SET @points_shop_count_ddl = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'points_shop_item_claims' AND column_name = 'purchase_count'
  ),
  'SELECT 1',
  'ALTER TABLE points_shop_item_claims ADD COLUMN purchase_count TINYINT UNSIGNED NOT NULL DEFAULT 1'
);
PREPARE points_shop_count_stmt FROM @points_shop_count_ddl;
EXECUTE points_shop_count_stmt;
DEALLOCATE PREPARE points_shop_count_stmt;

INSERT IGNORE INTO points_economy_migration_state (migration_key)
VALUES ('points-economy-c12-shop-purchase-count-v1');

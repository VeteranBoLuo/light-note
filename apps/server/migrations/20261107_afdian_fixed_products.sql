-- 固定商品的结算快照和 API 核验事实。旧结算快照保持 NULL，继续按原规则处理。
DROP PROCEDURE IF EXISTS `ensure_afdian_fixed_product_columns`;
DELIMITER $$
CREATE PROCEDURE `ensure_afdian_fixed_product_columns`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'support_checkout_intents' AND column_name = 'afdian_plan_id'
  ) THEN
    ALTER TABLE `support_checkout_intents` ADD COLUMN `afdian_plan_id` CHAR(32) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'support_checkout_intents' AND column_name = 'afdian_sku_id'
  ) THEN
    ALTER TABLE `support_checkout_intents` ADD COLUMN `afdian_sku_id` CHAR(32) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'support_orders' AND column_name = 'product_sku_id'
  ) THEN
    ALTER TABLE `support_orders` ADD COLUMN `product_sku_id` CHAR(32) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  END IF;
END$$
DELIMITER ;
CALL `ensure_afdian_fixed_product_columns`();
DROP PROCEDURE IF EXISTS `ensure_afdian_fixed_product_columns`;

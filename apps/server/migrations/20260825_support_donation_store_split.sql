-- 将“单纯支持”与“永久权益购买”拆成独立业务用途。
-- MySQL 5.7 兼容、可重复执行；历史已发 AI 不追回，既有套餐订单不进入支持者榜。

DROP PROCEDURE IF EXISTS `ensure_support_order_purpose_column`;
DELIMITER $$
CREATE PROCEDURE `ensure_support_order_purpose_column`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='support_orders'
       AND COLUMN_NAME='order_purpose'
  ) THEN
    ALTER TABLE `support_orders`
      ADD COLUMN `order_purpose` varchar(24) CHARACTER SET ascii COLLATE ascii_bin
      NOT NULL DEFAULT 'unknown' AFTER `ownership_source`;
  END IF;
END$$
DELIMITER ;

CALL `ensure_support_order_purpose_column`();
DROP PROCEDURE `ensure_support_order_purpose_column`;

-- 拆分迁移可以在套餐迁移之前安全执行；用途回填只依赖 intent_type，
-- 因此先幂等补齐该列，避免发布脚本顺序变化时直接失败。
DROP PROCEDURE IF EXISTS `ensure_support_intent_type_column`;
DELIMITER $$
CREATE PROCEDURE `ensure_support_intent_type_column`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='support_checkout_intents'
       AND COLUMN_NAME='intent_type'
  ) THEN
    ALTER TABLE `support_checkout_intents`
      ADD COLUMN `intent_type` varchar(16) CHARACTER SET ascii COLLATE ascii_bin
      NOT NULL DEFAULT 'legacy' AFTER `option_key`;
  END IF;
END$$
DELIMITER ;

CALL `ensure_support_intent_type_column`();
DROP PROCEDURE `ensure_support_intent_type_column`;

-- 该行第一次写入的 activated_at 是不可移动的新旧规则边界。
INSERT IGNORE INTO `support_reward_policy_state`
  (`policy_version`,`tokens_per_cny`,`auto_credit_max_amount`)
VALUES ('support-pure-v2',0,0);

-- 已经存在的套餐订单先按可信结算意图回填为购买，避免迁移窗口误入支持者榜。
UPDATE `support_orders` o
INNER JOIN `support_checkout_intents` i ON i.`id`=o.`checkout_intent_id`
   SET o.`order_purpose`='entitlement_purchase'
 WHERE o.`order_purpose`='unknown'
   AND i.`intent_type` IN ('permanent','campaign');

-- 新版纯支持意图若已提前写入，也按意图回填。
UPDATE `support_orders` o
INNER JOIN `support_checkout_intents` i ON i.`id`=o.`checkout_intent_id`
   SET o.`order_purpose`='donation'
 WHERE o.`order_purpose`='unknown'
   AND i.`intent_type`='donation';

-- 迁移前已经登记的非套餐支持继续保留旧规则；包括尚待 API 核验的旧回调，
-- 避免用户在旧页面承诺下付款却因部署窗口丢失权益。
UPDATE `support_orders` o
LEFT JOIN `support_checkout_intents` i ON i.`id`=o.`checkout_intent_id`
INNER JOIN `support_reward_policy_state` p ON p.`policy_version`='support-pure-v2'
   SET o.`order_purpose`='legacy_support'
 WHERE o.`order_purpose`='unknown'
   AND COALESCE(o.`provider_created_at`,o.`create_time`) <= p.`activated_at`
   AND COALESCE(i.`intent_type`,'legacy') NOT IN ('permanent','campaign','donation');

DROP PROCEDURE IF EXISTS `ensure_support_order_purpose_index`;
DELIMITER $$
CREATE PROCEDURE `ensure_support_order_purpose_index`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='support_orders'
       AND INDEX_NAME='idx_support_order_purpose_ranking'
  ) THEN
    ALTER TABLE `support_orders`
      ADD KEY `idx_support_order_purpose_ranking`
        (`order_purpose`,`verification_state`,`provider_status`,`ranking_observed_at`,`light_note_user_id`);
  END IF;
END$$
DELIMITER ;

CALL `ensure_support_order_purpose_index`();
DROP PROCEDURE `ensure_support_order_purpose_index`;

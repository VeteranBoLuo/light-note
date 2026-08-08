-- 我的成长：AI 加油包永久余额。
-- 新版后端只写 user_growth.ai_bonus_tokens；每日等级额度先用，耗尽后由 aiQuota 自动扣减此余额。
-- ai_daily_bonus 与 user_item.ai_pack 暂保留用于历史兼容，不做破坏性删除。

SET @growth_ai_wallet_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_growth'
    AND COLUMN_NAME = 'ai_bonus_tokens'
);
SET @growth_ai_wallet_sql := IF(
  @growth_ai_wallet_column_exists = 0,
  'ALTER TABLE `user_growth` ADD COLUMN `ai_bonus_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT ''永久 AI 加油余额(tokens),每日等级额度耗尽后自动扣减''',
  'SELECT 1'
);
PREPARE growth_ai_wallet_stmt FROM @growth_ai_wallet_sql;
EXECUTE growth_ai_wallet_stmt;
DEALLOCATE PREPARE growth_ai_wallet_stmt;

-- 切换当天若仍有旧版「今日加油」余额，按用户友好原则全额转入永久余额。
-- 只处理当天且在同一事务内更新后删除；历史已过期天不重复补发，旧背包物品继续由兼容入口手动转换。
SET @growth_ai_daily_bonus_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_daily_bonus'
);
START TRANSACTION;
SET @growth_ai_daily_bonus_move_sql := IF(
  @growth_ai_daily_bonus_table_exists > 0,
  'INSERT INTO user_growth (user_id, ai_bonus_tokens) SELECT b.user_id, GREATEST(0, b.bonus_tokens) FROM ai_daily_bonus b WHERE b.day = DATE_FORMAT(CURDATE(), ''%Y%m%d'') ON DUPLICATE KEY UPDATE ai_bonus_tokens = user_growth.ai_bonus_tokens + VALUES(ai_bonus_tokens)',
  'SELECT 1'
);
PREPARE growth_ai_daily_bonus_move_stmt FROM @growth_ai_daily_bonus_move_sql;
EXECUTE growth_ai_daily_bonus_move_stmt;
DEALLOCATE PREPARE growth_ai_daily_bonus_move_stmt;

SET @growth_ai_daily_bonus_clear_sql := IF(
  @growth_ai_daily_bonus_table_exists > 0,
  'DELETE FROM ai_daily_bonus WHERE day = DATE_FORMAT(CURDATE(), ''%Y%m%d'')',
  'SELECT 1'
);
PREPARE growth_ai_daily_bonus_clear_stmt FROM @growth_ai_daily_bonus_clear_sql;
EXECUTE growth_ai_daily_bonus_clear_stmt;
DEALLOCATE PREPARE growth_ai_daily_bonus_clear_stmt;
COMMIT;

-- 积分经济 C4：消费幂等收据、付费保底独立状态与一次性旧进度继承。
-- 执行前必须同时关闭免费/付费抽奖入口；回填完成并核对后再统一激活 C4。
-- 本文件用迁移状态键保证误重复执行时不会把 C4 期间的新付费进度覆盖回旧口径。

CREATE TABLE IF NOT EXISTS points_economy_operations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  operation_type VARCHAR(32) NOT NULL,
  economy_version VARCHAR(32) NOT NULL,
  operation_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  result_json JSON DEFAULT NULL,
  item_id VARCHAR(64) DEFAULT NULL,
  cost_points INT UNSIGNED NOT NULL DEFAULT 0,
  points_rewarded INT UNSIGNED NOT NULL DEFAULT 0,
  ai_tokens_granted BIGINT UNSIGNED NOT NULL DEFAULT 0,
  storage_mb_granted INT UNSIGNED NOT NULL DEFAULT 0,
  makeup_cards_granted INT UNSIGNED NOT NULL DEFAULT 0,
  draw_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  pity_hits SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  replay_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_replayed_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_points_economy_user_request (user_id, request_id),
  KEY idx_points_economy_version_time (economy_version, create_time),
  KEY idx_points_economy_status_time (status, create_time),
  KEY idx_points_economy_metrics (status, economy_version, operation_type, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分消费幂等与结果审计收据';

CREATE TABLE IF NOT EXISTS points_economy_migration_state (
  migration_key VARCHAR(64) NOT NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  meta JSON DEFAULT NULL,
  PRIMARY KEY (migration_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分经济一次性迁移状态';

-- 兼容先部署过早期 C4 表草案的环境；MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS。
-- 逐列使用动态 SQL，避免在目标列已存在时让整个迁移失败。
SET @c4_col = 'item_id'; SET @c4_def = 'VARCHAR(64) DEFAULT NULL';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'cost_points'; SET @c4_def = 'INT UNSIGNED NOT NULL DEFAULT 0';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'points_rewarded'; SET @c4_def = 'INT UNSIGNED NOT NULL DEFAULT 0';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'ai_tokens_granted'; SET @c4_def = 'BIGINT UNSIGNED NOT NULL DEFAULT 0';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'storage_mb_granted'; SET @c4_def = 'INT UNSIGNED NOT NULL DEFAULT 0';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'makeup_cards_granted'; SET @c4_def = 'INT UNSIGNED NOT NULL DEFAULT 0';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'draw_count'; SET @c4_def = 'SMALLINT UNSIGNED NOT NULL DEFAULT 0';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'pity_hits'; SET @c4_def = 'SMALLINT UNSIGNED NOT NULL DEFAULT 0';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'replay_count'; SET @c4_def = 'INT UNSIGNED NOT NULL DEFAULT 0';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;
SET @c4_col = 'last_replayed_at'; SET @c4_def = 'DATETIME DEFAULT NULL';
SET @c4_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND column_name=@c4_col)=0, CONCAT('ALTER TABLE points_economy_operations ADD COLUMN ', @c4_col, ' ', @c4_def), 'SELECT 1'); PREPARE c4_stmt FROM @c4_sql; EXECUTE c4_stmt; DEALLOCATE PREPARE c4_stmt;

SET @c4_metrics_index_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND index_name='idx_points_economy_metrics')=0,
  'ALTER TABLE points_economy_operations ADD INDEX idx_points_economy_metrics (status, economy_version, operation_type, item_id)',
  'SELECT 1'
);
PREPARE c4_metrics_index_stmt FROM @c4_metrics_index_sql;
EXECUTE c4_metrics_index_stmt;
DEALLOCATE PREPARE c4_metrics_index_stmt;

SET @c4_paid_count_missing = (
  SELECT COUNT(*) = 0 FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'user_growth' AND column_name = 'lottery_paid_count'
);
SET @c4_paid_count_sql = IF(
  @c4_paid_count_missing,
  'ALTER TABLE user_growth ADD COLUMN lottery_paid_count BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''C4 付费抽累计次数''',
  'SELECT 1'
);
PREPARE c4_paid_count_stmt FROM @c4_paid_count_sql;
EXECUTE c4_paid_count_stmt;
DEALLOCATE PREPARE c4_paid_count_stmt;

SET @c4_paid_pity_missing = (
  SELECT COUNT(*) = 0 FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'user_growth' AND column_name = 'lottery_paid_pity_progress'
);
SET @c4_paid_pity_sql = IF(
  @c4_paid_pity_missing,
  'ALTER TABLE user_growth ADD COLUMN lottery_paid_pity_progress TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''C4 付费保底进度 0-9''',
  'SELECT 1'
);
PREPARE c4_paid_pity_stmt FROM @c4_paid_pity_sql;
EXECUTE c4_paid_pity_stmt;
DEALLOCATE PREPARE c4_paid_pity_stmt;

SET @c4_should_backfill = (
  SELECT COUNT(*) = 0 FROM points_economy_migration_state
   WHERE migration_key = 'points-economy-c4-paid-pity-v1'
);

UPDATE user_growth ug
LEFT JOIN (
  SELECT user_id,
         SUM(CASE WHEN ref = 'x10' THEN 10 ELSE 1 END) AS paid_count
    FROM points_log
   WHERE reason = 'lottery_cost'
   GROUP BY user_id
) history ON history.user_id = ug.user_id
SET ug.lottery_paid_count = COALESCE(history.paid_count, 0),
    ug.lottery_paid_pity_progress = MOD(COALESCE(ug.lottery_count, 0), 10)
WHERE @c4_should_backfill = 1;

INSERT IGNORE INTO points_economy_migration_state (migration_key, meta)
VALUES (
  'points-economy-c4-paid-pity-v1',
  JSON_OBJECT('source', 'lottery_cost + legacy lottery_count', 'completedBy', '20260813_points_economy_c4.sql')
);

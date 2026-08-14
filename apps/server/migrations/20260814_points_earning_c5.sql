-- 积分获取 C5：策略版本、旧成就承诺快照、不可变知识行为事实、对账期初基线与 Campaign。
--
-- 执行顺序：先关闭 POINTS_EARNING_C5_ENABLED / POINTS_ADMIN_GOVERNANCE_V2_ENABLED /
-- POINTS_CAMPAIGN_ENABLED，在维护窗口完整执行本文件并跑 schema-assertions.sql；随后配置
-- 完整自然日和自然周边界再灰度开关。大表历史回填只在这里执行，应用启动不会扫描业务表。
-- MySQL 5.7 兼容；动态补列/索引一律先查 information_schema。

CREATE TABLE IF NOT EXISTS points_earning_period_policy (
  period_type VARCHAR(8) NOT NULL,
  period_key CHAR(8) NOT NULL,
  policy_version VARCHAR(32) NOT NULL,
  selected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (period_type, period_key),
  KEY idx_points_period_policy_version (policy_version, selected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分获取日/周策略版本锁';

CREATE TABLE IF NOT EXISTS points_grant_operations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,
  request_id VARCHAR(96) NOT NULL,
  operation_type VARCHAR(32) NOT NULL,
  operation_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  points BIGINT NOT NULL,
  reason VARCHAR(32) NOT NULL,
  ref VARCHAR(64) DEFAULT NULL,
  policy_version VARCHAR(32) DEFAULT NULL,
  result_json JSON DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_points_grant_user_request (user_id, request_id),
  KEY idx_points_grant_status_time (status, create_time),
  KEY idx_points_grant_type_time (operation_type, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='非消费积分发放幂等收据';

CREATE TABLE IF NOT EXISTS points_ledger_baselines (
  user_id VARCHAR(64) NOT NULL,
  baseline_delta BIGINT NOT NULL DEFAULT 0,
  captured_balance BIGINT NOT NULL DEFAULT 0,
  captured_ledger_sum BIGINT NOT NULL DEFAULT 0,
  policy_version VARCHAR(32) NOT NULL,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='C5 对账期初差额基线';

CREATE TABLE IF NOT EXISTS points_campaigns (
  id BIGINT NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  points_per_user INT UNSIGNED NOT NULL,
  audience_json JSON NOT NULL,
  recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
  delivered_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_points BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reason_code VARCHAR(32) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  create_request_id VARCHAR(64) NOT NULL,
  create_payload_hash CHAR(64) NOT NULL,
  confirmed_by VARCHAR(64) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  frozen_at DATETIME DEFAULT NULL,
  confirmed_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_points_campaign_public (public_id),
  UNIQUE KEY uk_points_campaign_create_request (created_by, create_request_id),
  KEY idx_points_campaign_status_time (status, update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='正向积分活动批次';

CREATE TABLE IF NOT EXISTS points_campaign_recipients (
  campaign_id BIGINT NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  points INT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  request_id VARCHAR(96) NOT NULL,
  lease_owner VARCHAR(64) DEFAULT NULL,
  lease_until DATETIME DEFAULT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  delivered_at DATETIME DEFAULT NULL,
  error_code VARCHAR(64) DEFAULT NULL,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, user_id),
  UNIQUE KEY uk_points_campaign_request (request_id),
  KEY idx_points_campaign_recipient_work (campaign_id, status, lease_until, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分活动冻结名单与交付状态';

-- C5 兼容补列：动态 SQL 可重复执行。
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_log' AND column_name='policy_version')=0,
  'ALTER TABLE points_log ADD COLUMN policy_version VARCHAR(32) DEFAULT NULL AFTER ref', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_log' AND column_name='meta')=0,
  'ALTER TABLE points_log ADD COLUMN meta JSON DEFAULT NULL AFTER policy_version', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;

SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_achievements' AND column_name='reward_points_snapshot')=0,
  'ALTER TABLE user_achievements ADD COLUMN reward_points_snapshot INT DEFAULT NULL AFTER claimed_at', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_achievements' AND column_name='reward_frame_id_snapshot')=0,
  'ALTER TABLE user_achievements ADD COLUMN reward_frame_id_snapshot VARCHAR(64) DEFAULT NULL AFTER reward_points_snapshot', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_achievements' AND column_name='policy_version')=0,
  'ALTER TABLE user_achievements ADD COLUMN policy_version VARCHAR(32) DEFAULT NULL AFTER reward_frame_id_snapshot', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;

SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_growth_preferences' AND column_name='points_goal_item_id')=0,
  'ALTER TABLE user_growth_preferences ADD COLUMN points_goal_item_id VARCHAR(64) DEFAULT NULL AFTER utc_offset_minutes', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_growth_preferences' AND column_name='points_goal_enabled')=0,
  'ALTER TABLE user_growth_preferences ADD COLUMN points_goal_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER points_goal_item_id', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;

SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_campaigns' AND column_name='create_request_id')=0,
  'ALTER TABLE points_campaigns ADD COLUMN create_request_id VARCHAR(64) DEFAULT NULL AFTER created_by', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='points_campaigns' AND column_name='create_payload_hash')=0,
  'ALTER TABLE points_campaigns ADD COLUMN create_payload_hash CHAR(64) DEFAULT NULL AFTER create_request_id', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='points_campaigns' AND index_name='uk_points_campaign_create_request')=0,
  'ALTER TABLE points_campaigns ADD UNIQUE INDEX uk_points_campaign_create_request (created_by, create_request_id)', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;

-- C5 查询索引。不要使用 MySQL 8 才支持的 ADD INDEX IF NOT EXISTS。
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='points_log' AND index_name='idx_points_log_time_reason')=0,
  'ALTER TABLE points_log ADD INDEX idx_points_log_time_reason (create_time, reason)', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='points_log' AND index_name='idx_points_log_user_time')=0,
  'ALTER TABLE points_log ADD INDEX idx_points_log_user_time (user_id, create_time, id)', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='points_log' AND index_name='idx_points_log_policy_time')=0,
  'ALTER TABLE points_log ADD INDEX idx_points_log_policy_time (policy_version, create_time)', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='growth_events' AND index_name='idx_growth_events_activity')=0,
  'ALTER TABLE growth_events ADD INDEX idx_growth_events_activity (user_id, source, status, create_time)', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='user_growth' AND index_name='idx_user_growth_points')=0,
  'ALTER TABLE user_growth ADD INDEX idx_user_growth_points (points, user_id)', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;
SET @c5_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='points_economy_operations' AND index_name='idx_points_economy_user_status_time')=0,
  'ALTER TABLE points_economy_operations ADD INDEX idx_points_economy_user_status_time (user_id, status, create_time, id)', 'SELECT 1');
PREPARE c5_stmt FROM @c5_sql; EXECUTE c5_stmt; DEALLOCATE PREPARE c5_stmt;

-- 先把旧 points_log 中已经解锁/领取的永久状态并入新表。
INSERT INTO user_achievements (user_id, achievement_key, unlocked_at, claimed_at)
SELECT user_id, ref, MIN(create_time), MIN(CASE WHEN reason='achievement' THEN create_time ELSE NULL END)
  FROM points_log
 WHERE reason IN ('ach_unlock', 'achievement') AND ref IS NOT NULL AND ref <> ''
 GROUP BY user_id, ref
ON DUPLICATE KEY UPDATE
  unlocked_at=LEAST(user_achievements.unlocked_at, VALUES(unlocked_at)),
  claimed_at=COALESCE(user_achievements.claimed_at, VALUES(claimed_at));

-- 已经满足旧资格、但新规则会增加等级/活跃日条件的用户必须在切换前固化旧承诺。
INSERT IGNORE INTO user_achievements (user_id, achievement_key, unlocked_at)
SELECT b.user_id, 'bookmark_200', NOW()
  FROM bookmark b
  LEFT JOIN onboarding_seed_resources osr ON osr.user_id=b.user_id AND osr.resource_type='bookmark' AND osr.resource_id=b.id
 WHERE b.del_flag=0 AND osr.user_id IS NULL GROUP BY b.user_id HAVING COUNT(*) >= 200;

INSERT IGNORE INTO user_achievements (user_id, achievement_key, unlocked_at)
SELECT td.user_id, thresholds.achievement_key, NOW()
  FROM todo_items td
  JOIN (SELECT 'todo_500' achievement_key, 500 target UNION ALL SELECT 'todo_1000', 1000) thresholds
 WHERE td.del_flag=0 AND td.status='completed'
 GROUP BY td.user_id, thresholds.achievement_key, thresholds.target HAVING COUNT(*) >= thresholds.target;

INSERT IGNORE INTO user_achievements (user_id, achievement_key, unlocked_at)
SELECT ri.user_id, thresholds.achievement_key, NOW()
  FROM resource_inbox ri
  JOIN (SELECT 'organize_500' achievement_key, 500 target UNION ALL SELECT 'organize_1000', 1000) thresholds
  LEFT JOIN onboarding_seed_resources osr ON osr.user_id=ri.user_id AND osr.resource_type=ri.resource_type AND osr.resource_id=ri.resource_id
 WHERE ri.status='completed' AND osr.user_id IS NULL
 GROUP BY ri.user_id, thresholds.achievement_key, thresholds.target HAVING COUNT(*) >= thresholds.target;

INSERT IGNORE INTO user_achievements (user_id, achievement_key, unlocked_at)
SELECT u.id, thresholds.achievement_key, NOW()
  FROM user u
  JOIN (
    SELECT 'join_7' achievement_key, 7 target UNION ALL SELECT 'join_30', 30 UNION ALL
    SELECT 'join_100', 100 UNION ALL SELECT 'join_365', 365
  ) thresholds
 WHERE u.del_flag=0 AND COALESCE(u.role, 'user') = 'user'
   AND DATEDIFF(CURDATE(), DATE(u.create_time)) + 1 >= thresholds.target;

-- 旧成就奖励快照：已解锁未领取也不会在 C5 后被静默降额；头像框 ID 与现有目录一致。
UPDATE user_achievements ua
JOIN (
  SELECT 'streak_1' k,10 p,'frame_first_light' f UNION ALL SELECT 'streak_7',50,'frame_streak_seed' UNION ALL
  SELECT 'streak_30',120,'frame_streak_month' UNION ALL SELECT 'streak_100',300,NULL UNION ALL SELECT 'streak_365',800,'frame_streak_eternal' UNION ALL
  SELECT 'checkin_50',80,NULL UNION ALL SELECT 'checkin_100',150,NULL UNION ALL
  SELECT 'bookmark_20',40,'frame_bookmark_seed' UNION ALL SELECT 'bookmark_50',80,NULL UNION ALL SELECT 'bookmark_200',200,NULL UNION ALL SELECT 'bookmark_500',400,'frame_bookmark_archive' UNION ALL
  SELECT 'note_10',40,'frame_note_seed' UNION ALL SELECT 'note_20',60,NULL UNION ALL SELECT 'note_50',120,NULL UNION ALL SELECT 'note_200',400,'frame_note_masterpiece' UNION ALL SELECT 'note_500',600,'frame_note_constellation' UNION ALL
  SELECT 'file_10',40,'frame_file_seed' UNION ALL SELECT 'file_50',100,NULL UNION ALL SELECT 'file_200',300,'frame_file_vault' UNION ALL SELECT 'file_500',500,'frame_file_constellation' UNION ALL
  SELECT 'todo_20',40,NULL UNION ALL SELECT 'todo_100',150,NULL UNION ALL SELECT 'todo_500',300,NULL UNION ALL SELECT 'todo_1000',500,NULL UNION ALL
  SELECT 'organize_20',40,NULL UNION ALL SELECT 'organize_100',150,NULL UNION ALL SELECT 'organize_500',300,NULL UNION ALL SELECT 'organize_1000',500,NULL UNION ALL
  SELECT 'level_5',100,NULL UNION ALL SELECT 'level_10',250,NULL UNION ALL SELECT 'level_15',600,NULL UNION ALL
  SELECT 'join_7',40,NULL UNION ALL SELECT 'join_30',100,NULL UNION ALL SELECT 'join_100',250,NULL UNION ALL SELECT 'join_365',600,NULL
) legacy ON legacy.k=ua.achievement_key
SET ua.reward_points_snapshot=COALESCE(ua.reward_points_snapshot, legacy.p),
    ua.reward_frame_id_snapshot=COALESCE(ua.reward_frame_id_snapshot, legacy.f),
    ua.policy_version=COALESCE(ua.policy_version, 'points-earning-legacy');

INSERT IGNORE INTO points_economy_migration_state (migration_key, meta)
VALUES ('points-earning-c5-achievement-snapshots-v1', JSON_OBJECT('policyVersion','points-earning-legacy','completedBy','20260814_points_earning_c5.sql'));

-- 固化不可变知识行为事实。排除 onboarding 示例；只存业务主键/哈希和低敏感类型。
INSERT IGNORE INTO growth_events (user_id,source,ref_id,day,amount,status,meta,create_time)
SELECT b.user_id,'activity_bookmark',SHA2(COALESCE(b.url,''),256),NULL,0,'granted',JSON_OBJECT('kind','bookmark','meaningful',true,'backfill',true),b.create_time
  FROM bookmark b
 WHERE b.del_flag=0 AND b.url IS NOT NULL AND b.url<>''
   AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr WHERE osr.user_id=b.user_id AND osr.resource_type='bookmark' AND osr.resource_id=b.id);
INSERT IGNORE INTO growth_events (user_id,source,ref_id,day,amount,status,meta,create_time)
SELECT n.create_by,'activity_note',CAST(n.id AS CHAR),NULL,0,'granted',JSON_OBJECT('kind','note','meaningful',true,'backfill',true),n.create_time
  FROM note n WHERE n.del_flag=0 AND n.create_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr WHERE osr.user_id=n.create_by AND osr.resource_type='note' AND osr.resource_id=n.id);
INSERT IGNORE INTO growth_events (user_id,source,ref_id,day,amount,status,meta,create_time)
SELECT f.create_by,'activity_file',CAST(f.id AS CHAR),NULL,0,'granted',JSON_OBJECT('kind','file','meaningful',true,'backfill',true),f.create_time
  FROM files f WHERE f.del_flag=0 AND f.create_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr WHERE osr.user_id=f.create_by AND osr.resource_type='file' AND osr.resource_id=CAST(f.id AS CHAR));
INSERT IGNORE INTO growth_events (user_id,source,ref_id,day,amount,status,meta,create_time)
SELECT td.user_id,'todo_complete',SHA2(CONCAT('todo:',CAST(td.id AS CHAR)),256),NULL,0,'granted',JSON_OBJECT('kind','todo','meaningful',true,'backfill',true),td.completed_at
  FROM todo_items td WHERE td.del_flag=0 AND td.status='completed' AND td.completed_at IS NOT NULL;
INSERT IGNORE INTO growth_events (user_id,source,ref_id,day,amount,status,meta,create_time)
SELECT ri.user_id,'organize_complete',SHA2(CONCAT('organize:',ri.resource_type,':',ri.resource_id),256),NULL,0,'granted',JSON_OBJECT('kind','organize','meaningful',true,'backfill',true),ri.complete_time
  FROM resource_inbox ri WHERE ri.status='completed' AND ri.complete_time IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr WHERE osr.user_id=ri.user_id AND osr.resource_type=ri.resource_type AND osr.resource_id=ri.resource_id);

INSERT IGNORE INTO points_economy_migration_state (migration_key, meta)
VALUES ('points-earning-c5-meaningful-activity-v1', JSON_OBJECT('completedBy','20260814_points_earning_c5.sql'));

-- 最后捕获期初差额；此后对账公式为 baseline_delta + points_log 全量和。
INSERT INTO points_ledger_baselines (user_id,baseline_delta,captured_balance,captured_ledger_sum,policy_version)
SELECT ug.user_id,CAST(ug.points AS SIGNED)-COALESCE(ledger.total,0),CAST(ug.points AS SIGNED),COALESCE(ledger.total,0),'points-earning-legacy'
  FROM user_growth ug
  LEFT JOIN (SELECT user_id,SUM(delta) total FROM points_log GROUP BY user_id) ledger ON ledger.user_id=ug.user_id
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id);

INSERT IGNORE INTO points_economy_migration_state (migration_key, meta)
VALUES ('points-earning-c5-baseline-v1', JSON_OBJECT('policyVersion','points-earning-legacy','completedBy','20260814_points_earning_c5.sql'));

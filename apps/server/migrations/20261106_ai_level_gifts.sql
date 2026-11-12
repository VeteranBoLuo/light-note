-- 一次性等级赠礼的暂停控制结构；不执行历史账号发奖或余额回填。
CREATE TABLE IF NOT EXISTS ai_level_gift_controls (
  id tinyint unsigned NOT NULL,
  paused_from datetime(3) DEFAULT NULL,
  reviewed_at datetime(3) DEFAULT NULL,
  reason varchar(500) DEFAULT NULL,
  updated_by varchar(64) DEFAULT NULL,
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO ai_level_gift_controls (id) VALUES (1);

-- 只扩展限制枚举，保留所有既有类型；重复运行不改变行。
SET @gift_hold_type := (SELECT column_type FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='security_account_restrictions' AND column_name='restriction_type');
SET @gift_hold_ddl := IF(@gift_hold_type IS NOT NULL AND LOCATE("'gift_hold'", @gift_hold_type)=0,
  "ALTER TABLE security_account_restrictions MODIFY restriction_type ENUM('login_lock','write_lock','upload_lock','ai_lock','full_lock','gift_hold') NOT NULL", 'SELECT 1');
PREPARE stmt FROM @gift_hold_ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @gift_review_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ai_level_gift_controls' AND column_name='reviewed_at');
SET @gift_review_ddl := IF(@gift_review_col=0, 'ALTER TABLE ai_level_gift_controls ADD reviewed_at datetime(3) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @gift_review_ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

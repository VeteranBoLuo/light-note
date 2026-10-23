-- 加法结构；不扫描、修改或验证历史用户邮箱。
CREATE TABLE IF NOT EXISTS account_email_health_runs (
  period char(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  after_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT '',
  completed tinyint NOT NULL DEFAULT 0,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- 独立去重事实，不随通知删除而删除；账号正式注销时清理。
CREATE TABLE IF NOT EXISTS account_email_health_notices (
  user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  email_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  issue_code varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, email_hash, issue_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

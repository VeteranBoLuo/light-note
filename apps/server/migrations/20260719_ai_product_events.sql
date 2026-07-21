-- AI 产品学习事件：只接受服务端白名单 ID、枚举、布尔值和数量，不保存问题/回答/标题/摘录。
-- 应用层默认保留 180 天（AI_PRODUCT_EVENT_RETENTION_DAYS 可在 30～730 天内调整）并按 create_time 清理。
-- MySQL 5.7 / utf8mb4 兼容；可重复执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_product_events (
  id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  subject_user_id VARCHAR(64) NOT NULL,
  admin_context_id VARCHAR(64) NULL,
  admin_context_mode VARCHAR(16) NOT NULL DEFAULT 'normal',
  event_name VARCHAR(64) NOT NULL,
  dimensions_json JSON NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_product_event_name_time (event_name, create_time),
  KEY idx_ai_product_event_owner_time (actor_user_id, subject_user_id, admin_context_mode, create_time),
  KEY idx_ai_product_event_context (admin_context_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

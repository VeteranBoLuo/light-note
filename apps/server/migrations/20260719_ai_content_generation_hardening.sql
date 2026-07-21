-- 个人知识索引跨实例失效代际。
-- 写入/删除私人资源时递增代际；索引构建与持久化以该行作为 CAS/互斥边界。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_content_generations (
  subject_user_id VARCHAR(64) NOT NULL,
  generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (subject_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

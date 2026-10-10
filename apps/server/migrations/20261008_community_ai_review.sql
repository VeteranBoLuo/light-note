-- Additive only. Existing posts are not queued; install before enabling AI review.
CREATE TABLE IF NOT EXISTS community_post_review_jobs (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 post_id bigint unsigned NOT NULL,
 revision_id bigint unsigned NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'pending',
 policy_version int NOT NULL DEFAULT 1,
 request_id char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 lease_token char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 lease_until datetime(6) DEFAULT NULL,
 budget_day date DEFAULT NULL,
 reserved_tokens int unsigned NOT NULL DEFAULT 0,
 result_json json DEFAULT NULL,
 reason_code varchar(64) DEFAULT NULL,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 finished_at datetime(6) DEFAULT NULL,
 PRIMARY KEY (id), UNIQUE KEY uk_revision (revision_id),
 KEY idx_pending (status,id), KEY idx_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS community_review_daily_budget (
 budget_day date NOT NULL, consumed_tokens bigint unsigned NOT NULL DEFAULT 0,
 PRIMARY KEY (budget_day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

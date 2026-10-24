-- Explicit additive migration. No existing resources are published or queued.
CREATE TABLE IF NOT EXISTS public_resource_publications (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 owner_id varchar(36) NOT NULL,
 kind varchar(12) NOT NULL,
 source_id varchar(64) NOT NULL,
 published_revision_id bigint unsigned DEFAULT NULL,
 pending_revision_id bigint unsigned DEFAULT NULL,
 latest_revision_id bigint unsigned DEFAULT NULL,
 version int unsigned NOT NULL DEFAULT 0,
 withdrawn tinyint NOT NULL DEFAULT 0,
 removed tinyint NOT NULL DEFAULT 0,
 reason varchar(500) NOT NULL DEFAULT '',
 published_at datetime(6) DEFAULT NULL,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id), UNIQUE KEY uk_public_id(public_id), UNIQUE KEY uk_source(owner_id,kind,source_id),
 KEY idx_public(published_at,id), KEY idx_owner(owner_id,updated_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_resource_revisions (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 publication_id bigint unsigned NOT NULL,
 revision int unsigned NOT NULL,
 title varchar(255) NOT NULL,
 body mediumtext NOT NULL,
 url varchar(255) NOT NULL DEFAULT '',
 description varchar(255) NOT NULL DEFAULT '',
 fingerprint char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'pending_review',
 reason varchar(500) NOT NULL DEFAULT '',
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 reviewed_at datetime(6) DEFAULT NULL,
 PRIMARY KEY(id), UNIQUE KEY uk_revision(publication_id,revision), KEY idx_publication(publication_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_resource_review_jobs (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 publication_id bigint unsigned NOT NULL,
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
 PRIMARY KEY(id), UNIQUE KEY uk_revision(revision_id), KEY idx_pending(status,id), KEY idx_publication(publication_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_resource_review_budget (
 budget_day date NOT NULL, consumed_tokens bigint unsigned NOT NULL DEFAULT 0, PRIMARY KEY(budget_day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_resource_actions (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 publication_id bigint unsigned NOT NULL,
 revision_id bigint unsigned DEFAULT NULL,
 actor_id varchar(36) NOT NULL,
 action varchar(24) NOT NULL,
 reason varchar(500) NOT NULL DEFAULT '',
 version int unsigned NOT NULL,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id), UNIQUE KEY uk_public_id(public_id), KEY idx_publication(publication_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_resource_reports (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reporter_id varchar(36) NOT NULL,
 publication_id bigint unsigned NOT NULL,
 revision_id bigint unsigned NOT NULL,
 reason varchar(500) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'pending',
 version int unsigned NOT NULL DEFAULT 0,
 handled_by varchar(36) DEFAULT NULL,
 handled_reason varchar(500) NOT NULL DEFAULT '',
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id), UNIQUE KEY uk_public_id(public_id), UNIQUE KEY uk_report(reporter_id,revision_id), KEY idx_status(status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_resource_receipts (
 actor_id varchar(36) NOT NULL,
 request_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result json NOT NULL,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(actor_id,request_id), KEY idx_actor_time(actor_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_resource_events (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 event_key varchar(140) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 publication_id bigint unsigned NOT NULL,
 revision_id bigint unsigned DEFAULT NULL,
 action_id bigint unsigned DEFAULT NULL,
 kind varchar(16) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'pending',
 recipient_cursor varchar(36) NOT NULL DEFAULT '',
 lease_token char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 lease_until datetime(6) DEFAULT NULL,
 next_attempt_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 attempts int unsigned NOT NULL DEFAULT 0,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id), UNIQUE KEY uk_event(event_key), KEY idx_pending(status,id), KEY idx_publication(publication_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_resource_saved_sources (
 recipient_id varchar(36) NOT NULL,
 kind varchar(12) NOT NULL,
 resource_id varchar(64) NOT NULL,
 author_public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 author_name varchar(255) NOT NULL,
 source_url varchar(255) NOT NULL,
 revision int unsigned NOT NULL,
 PRIMARY KEY(recipient_id,kind,resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

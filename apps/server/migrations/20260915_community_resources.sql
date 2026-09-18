-- Fixed text snapshots. Optional capability; never stores source IDs or private sharing tokens.
CREATE TABLE IF NOT EXISTS community_resource_snapshots (
 public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 owner_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 post_id bigint unsigned DEFAULT NULL,
 kind varchar(16) NOT NULL,
 title varchar(255) NOT NULL,
 body MEDIUMTEXT NOT NULL,
 url varchar(2048) NOT NULL DEFAULT '',
 created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(public_id), KEY idx_owner(owner_id,post_id), KEY idx_cleanup(post_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS community_revision_resources (
 revision_id bigint unsigned NOT NULL,
 resource_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sort_order int unsigned NOT NULL,
 PRIMARY KEY(revision_id,resource_id), UNIQUE KEY uk_order(revision_id,sort_order), KEY idx_resource(resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

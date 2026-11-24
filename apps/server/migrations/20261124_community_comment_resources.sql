-- Fixed resource snapshots attached to comments and replies.
CREATE TABLE IF NOT EXISTS community_comment_resources (
 resource_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 comment_id bigint unsigned NOT NULL,
 sort_order int unsigned NOT NULL,
 PRIMARY KEY(resource_id), UNIQUE KEY uk_order(comment_id,sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

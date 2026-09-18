-- Additive image storage; existing text feed remains available without these tables.
CREATE TABLE IF NOT EXISTS community_post_images (
 public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 owner_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 post_id bigint unsigned DEFAULT NULL,
 object_key varchar(255) NOT NULL, content_type varchar(40) NOT NULL,
 content_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 file_size int unsigned NOT NULL, width int unsigned NOT NULL, height int unsigned NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'uploading',
 created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(public_id), KEY idx_owner(owner_id,status), KEY idx_cleanup(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS community_revision_images (
 revision_id bigint unsigned NOT NULL, image_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sort_order int unsigned NOT NULL,
 PRIMARY KEY(revision_id,image_id), UNIQUE KEY uk_order(revision_id,sort_order), KEY idx_image(image_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additive image preview migration. Run before new API/Worker startup.
CREATE TABLE IF NOT EXISTS image_assets (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 owner_user_id VARCHAR(255) NOT NULL,
 source_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_id VARCHAR(255) NOT NULL,
 identity_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 storage_kind ENUM('local','obs') NOT NULL,
 source_locator VARCHAR(1024) NOT NULL,
 source_version CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
 status ENUM('active','pending_delete','deleting') NOT NULL DEFAULT 'active',
 reconciled TINYINT NOT NULL DEFAULT 0,
 cleanup_after DATETIME NULL,
 delete_started_at DATETIME NULL,
 cleanup_attempts INT UNSIGNED NOT NULL DEFAULT 0,
 cleanup_error VARCHAR(64) NULL,
 create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_image_identity(identity_hash),
 KEY idx_image_cleanup(status,cleanup_after),
 KEY idx_image_owner(owner_user_id(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS image_asset_refs (
 asset_id BIGINT UNSIGNED NOT NULL,
 ref_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 ref_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(asset_id,ref_type,ref_id),
 KEY idx_image_ref(ref_type,ref_id),
 CONSTRAINT fk_image_ref_asset FOREIGN KEY(asset_id) REFERENCES image_assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SET @image_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='file_preview_artifacts' AND COLUMN_NAME='source_revision'),'SELECT 1','ALTER TABLE file_preview_artifacts ADD COLUMN source_revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''''');
PREPARE image_stmt FROM @image_ddl; EXECUTE image_stmt; DEALLOCATE PREPARE image_stmt;
SET @image_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='file_preview_artifacts' AND COLUMN_NAME='image_width'),'SELECT 1','ALTER TABLE file_preview_artifacts ADD COLUMN image_width INT UNSIGNED NOT NULL DEFAULT 0');
PREPARE image_stmt FROM @image_ddl; EXECUTE image_stmt; DEALLOCATE PREPARE image_stmt;
SET @image_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='file_preview_artifacts' AND COLUMN_NAME='image_height'),'SELECT 1','ALTER TABLE file_preview_artifacts ADD COLUMN image_height INT UNSIGNED NOT NULL DEFAULT 0');
PREPARE image_stmt FROM @image_ddl; EXECUTE image_stmt; DEALLOCATE PREPARE image_stmt;
ALTER TABLE file_preview_artifacts MODIFY COLUMN strategy ENUM('archive_manifest','converted_pdf','image_thumbnail','image_display') NOT NULL;
ALTER TABLE file_preview_artifacts DROP INDEX uk_file_preview_artifact, ADD UNIQUE KEY uk_file_preview_artifact (source_type,file_id,strategy,strategy_version,source_revision);
SET @image_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='file_preview_jobs' AND COLUMN_NAME='output_keys_json'),'SELECT 1','ALTER TABLE file_preview_jobs ADD COLUMN output_keys_json MEDIUMTEXT NULL');
PREPARE image_stmt FROM @image_ddl; EXECUTE image_stmt; DEALLOCATE PREPARE image_stmt;

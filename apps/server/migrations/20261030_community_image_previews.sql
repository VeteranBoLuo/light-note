-- Optional derived images. Existing originals and revision references remain unchanged.
SET @community_preview_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='community_post_images' AND column_name='preview_object_key'), 'SELECT 1', 'ALTER TABLE community_post_images ADD COLUMN preview_object_key varchar(255) DEFAULT NULL');
PREPARE community_preview_stmt FROM @community_preview_ddl;
EXECUTE community_preview_stmt;
DEALLOCATE PREPARE community_preview_stmt;
SET @community_preview_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='community_post_images' AND column_name='preview_file_size'), 'SELECT 1', 'ALTER TABLE community_post_images ADD COLUMN preview_file_size int unsigned DEFAULT NULL');
PREPARE community_preview_stmt FROM @community_preview_ddl;
EXECUTE community_preview_stmt;
DEALLOCATE PREPARE community_preview_stmt;
SET @community_preview_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='community_post_images' AND column_name='preview_width'), 'SELECT 1', 'ALTER TABLE community_post_images ADD COLUMN preview_width int unsigned DEFAULT NULL');
PREPARE community_preview_stmt FROM @community_preview_ddl;
EXECUTE community_preview_stmt;
DEALLOCATE PREPARE community_preview_stmt;
SET @community_preview_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='community_post_images' AND column_name='preview_height'), 'SELECT 1', 'ALTER TABLE community_post_images ADD COLUMN preview_height int unsigned DEFAULT NULL');
PREPARE community_preview_stmt FROM @community_preview_ddl;
EXECUTE community_preview_stmt;
DEALLOCATE PREPARE community_preview_stmt;

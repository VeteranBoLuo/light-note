-- Additive preference only. Defaults on; no historical likes are enqueued.
SET @community_like_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='community_profile_options' AND column_name='like_notifications_enabled'), 'SELECT 1', 'ALTER TABLE community_profile_options ADD COLUMN like_notifications_enabled tinyint NOT NULL DEFAULT 1');
PREPARE community_like_stmt FROM @community_like_ddl;
EXECUTE community_like_stmt;
DEALLOCATE PREPARE community_like_stmt;

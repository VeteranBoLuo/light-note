-- Additive preference; no historical chat notifications are backfilled.
SET @root_chat_ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='community_chat_user_settings' AND column_name='root_all_messages_enabled'), 'SELECT 1', 'ALTER TABLE community_chat_user_settings ADD COLUMN root_all_messages_enabled tinyint unsigned NOT NULL DEFAULT 1');
PREPARE root_chat_stmt FROM @root_chat_ddl;
EXECUTE root_chat_stmt;
DEALLOCATE PREPARE root_chat_stmt;

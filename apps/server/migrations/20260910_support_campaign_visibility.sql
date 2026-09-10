-- MySQL 5.7 additive, repeatable; existing activities remain hidden.
CREATE TABLE IF NOT EXISTS support_campaign_visibility_lock (id tinyint unsigned NOT NULL PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO support_campaign_visibility_lock (id) VALUES (1);
SET @ln_campaign_sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_campaigns' AND COLUMN_NAME = 'public_enabled'), 'SELECT 1', 'ALTER TABLE support_campaigns ADD COLUMN public_enabled tinyint unsigned NOT NULL DEFAULT 0');
PREPARE ln_campaign_stmt FROM @ln_campaign_sql;
EXECUTE ln_campaign_stmt;
DEALLOCATE PREPARE ln_campaign_stmt;
SET @ln_campaign_sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_campaigns' AND COLUMN_NAME = 'public_updated_by'), 'SELECT 1', 'ALTER TABLE support_campaigns ADD COLUMN public_updated_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL');
PREPARE ln_campaign_stmt FROM @ln_campaign_sql;
EXECUTE ln_campaign_stmt;
DEALLOCATE PREPARE ln_campaign_stmt;
SET @ln_campaign_sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_campaigns' AND COLUMN_NAME = 'public_updated_at'), 'SELECT 1', 'ALTER TABLE support_campaigns ADD COLUMN public_updated_at datetime DEFAULT NULL');
PREPARE ln_campaign_stmt FROM @ln_campaign_sql;
EXECUTE ln_campaign_stmt;
DEALLOCATE PREPARE ln_campaign_stmt;

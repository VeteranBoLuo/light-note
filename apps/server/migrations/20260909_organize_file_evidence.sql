-- Stop old document/organize Workers before applying; no content backfill.
SET NAMES utf8mb4;

SET @ln_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_document_sources' AND COLUMN_NAME='visual_evidence_json');
SET @ln_ddl = IF(@ln_exists=0, 'ALTER TABLE ai_document_sources ADD COLUMN visual_evidence_json JSON NULL', 'SELECT 1');
PREPARE ln_stmt FROM @ln_ddl;
EXECUTE ln_stmt;
DEALLOCATE PREPARE ln_stmt;

SET @ln_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_document_sources' AND COLUMN_NAME='visual_lease_token');
SET @ln_ddl = IF(@ln_exists=0, 'ALTER TABLE ai_document_sources ADD COLUMN visual_lease_token CHAR(36) NULL', 'SELECT 1');
PREPARE ln_stmt FROM @ln_ddl;
EXECUTE ln_stmt;
DEALLOCATE PREPARE ln_stmt;

SET @ln_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_document_sources' AND COLUMN_NAME='visual_lease_expires_at');
SET @ln_ddl = IF(@ln_exists=0, 'ALTER TABLE ai_document_sources ADD COLUMN visual_lease_expires_at DATETIME NULL', 'SELECT 1');
PREPARE ln_stmt FROM @ln_ddl;
EXECUTE ln_stmt;
DEALLOCATE PREPARE ln_stmt;

SET @ln_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_items' AND COLUMN_NAME='next_check_at');
SET @ln_ddl = IF(@ln_exists=0, 'ALTER TABLE organize_suggestion_items ADD COLUMN next_check_at DATETIME NULL', 'SELECT 1');
PREPARE ln_stmt FROM @ln_ddl;
EXECUTE ln_stmt;
DEALLOCATE PREPARE ln_stmt;

-- Member answers and indexed reward receipts. MySQL 5.7; additive and safe to re-run.
-- Historical anonymous answers remain anonymous. No account inference or reward backfill.
SET @collection_ddl = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_submissions' AND COLUMN_NAME='respondent_user_id'), 'SELECT 1', 'ALTER TABLE collection_submissions ADD COLUMN respondent_user_id VARCHAR(255) NULL');
PREPARE collection_stmt FROM @collection_ddl;
EXECUTE collection_stmt;
DEALLOCATE PREPARE collection_stmt;
SET @collection_ddl = IF(EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_submissions' AND INDEX_NAME='ix_collection_respondent_user'), 'SELECT 1', 'ALTER TABLE collection_submissions ADD KEY ix_collection_respondent_user(respondent_user_id)');
PREPARE collection_stmt FROM @collection_ddl;
EXECUTE collection_stmt;
DEALLOCATE PREPARE collection_stmt;
SET @collection_ddl = IF(EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='points_grant_operations' AND INDEX_NAME='idx_points_grant_request_status'), 'SELECT 1', 'ALTER TABLE points_grant_operations ADD KEY idx_points_grant_request_status(request_id,status)');
PREPARE collection_stmt FROM @collection_ddl;
EXECUTE collection_stmt;
DEALLOCATE PREPARE collection_stmt;

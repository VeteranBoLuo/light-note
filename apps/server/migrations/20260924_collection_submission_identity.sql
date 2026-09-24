-- Anonymous deduplication, MySQL 5.7; safe to re-run. No historical identity inference.
SET @collection_ddl = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_submissions' AND COLUMN_NAME='respondent_hash'), 'SELECT 1', 'ALTER TABLE collection_submissions ADD COLUMN respondent_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL');
PREPARE collection_stmt FROM @collection_ddl;
EXECUTE collection_stmt;
DEALLOCATE PREPARE collection_stmt;
SET @collection_ddl = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_submissions' AND COLUMN_NAME='updated_at'), 'SELECT 1', 'ALTER TABLE collection_submissions ADD COLUMN updated_at DATETIME(3) NULL');
PREPARE collection_stmt FROM @collection_ddl;
EXECUTE collection_stmt;
DEALLOCATE PREPARE collection_stmt;
SET @collection_ddl = IF(EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_submissions' AND INDEX_NAME='uq_collection_respondent'), 'SELECT 1', 'ALTER TABLE collection_submissions ADD UNIQUE KEY uq_collection_respondent(form_id,respondent_hash)');
PREPARE collection_stmt FROM @collection_ddl;
EXECUTE collection_stmt;
DEALLOCATE PREPARE collection_stmt;
CREATE TABLE IF NOT EXISTS collection_submission_requests (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 form_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 submission_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 respondent_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 outcome VARCHAR(16) NOT NULL,
 UNIQUE KEY uq_collection_receipt(form_id,request_key),
 CONSTRAINT fk_collection_receipt FOREIGN KEY(submission_id) REFERENCES collection_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO collection_submission_requests(id,form_id,submission_id,request_key,payload_hash,respondent_hash,outcome)
 SELECT UUID(),s.form_id,s.id,s.request_key,s.payload_hash,s.respondent_hash,'created'
 FROM collection_submissions s WHERE NOT EXISTS
 (SELECT 1 FROM collection_submission_requests r WHERE r.form_id=s.form_id AND r.request_key=s.request_key);

-- Explicit deployment migration. MySQL 5.7 compatible; never executed by request handlers.
CREATE TABLE IF NOT EXISTS collection_forms (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 user_id VARCHAR(255) NOT NULL,
 public_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 title VARCHAR(200) NOT NULL,
 definition JSON NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'draft',
 published TINYINT NOT NULL DEFAULT 0,
 version INT NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_collection_public(public_id),
 KEY ix_collection_owner(user_id, updated_at)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS collection_submissions (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 form_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 answers JSON NOT NULL,
 is_read TINYINT NOT NULL DEFAULT 0,
 processed TINYINT NOT NULL DEFAULT 0,
 spam TINYINT NOT NULL DEFAULT 0,
 private_note TEXT,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_collection_request(form_id,request_key),
 KEY ix_collection_submission(form_id,created_at,id),
 KEY ix_collection_unread(form_id,is_read),
 CONSTRAINT fk_collection_submission FOREIGN KEY(form_id) REFERENCES collection_forms(id) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS collection_answers (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 submission_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 form_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 question_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 text_value TEXT,
 number_value DOUBLE,
 KEY ix_collection_answer(form_id,question_id,submission_id),
 CONSTRAINT fk_collection_answer FOREIGN KEY(submission_id) REFERENCES collection_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS collection_choices (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 answer_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 option_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 UNIQUE KEY uq_collection_choice(answer_id,option_id),
 CONSTRAINT fk_collection_choice FOREIGN KEY(answer_id) REFERENCES collection_answers(id) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS collection_form_tags (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 form_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 tag_id VARCHAR(255) NOT NULL,
 user_id VARCHAR(255) NOT NULL,
 UNIQUE KEY uq_collection_tag(form_id,tag_id),
 KEY ix_collection_tag_owner(user_id,tag_id),
 CONSTRAINT fk_collection_tag FOREIGN KEY(form_id) REFERENCES collection_forms(id) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- P2 additive schema. No private data backfill; enabling the feature is a separate operation.
CREATE TABLE IF NOT EXISTS community_posts (
 id bigint unsigned NOT NULL AUTO_INCREMENT, public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, author_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'pending_review', published_revision_id bigint unsigned DEFAULT NULL, pending_revision_id bigint unsigned DEFAULT NULL,
 row_revision bigint unsigned NOT NULL DEFAULT 1, published_at datetime(6) DEFAULT NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 locked tinyint NOT NULL DEFAULT 0, resolved tinyint NOT NULL DEFAULT 0, solution_comment_id bigint unsigned DEFAULT NULL,
 PRIMARY KEY(id), UNIQUE KEY uk_public(public_id), KEY idx_feed(status,published_at,id), KEY idx_author(author_id,status,published_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_post_revisions (
 id bigint unsigned NOT NULL AUTO_INCREMENT, post_id bigint unsigned NOT NULL, revision_no bigint unsigned NOT NULL,
 kind varchar(16) NOT NULL, title varchar(320) NOT NULL, body text NOT NULL, mentions json NOT NULL, status varchar(24) NOT NULL DEFAULT 'pending_review',
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY(id), UNIQUE KEY uk_revision(post_id,revision_no), KEY idx_review(status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_topics (
 id bigint unsigned NOT NULL AUTO_INCREMENT, slug varchar(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 name_zh varchar(80) NOT NULL, name_en varchar(80) NOT NULL, enabled tinyint NOT NULL DEFAULT 1, sort_order int NOT NULL DEFAULT 0, PRIMARY KEY(id), UNIQUE KEY uk_slug(slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_revision_topics (
 revision_id bigint unsigned NOT NULL, topic_id bigint unsigned NOT NULL, PRIMARY KEY(revision_id,topic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_post_topics (
 post_id bigint unsigned NOT NULL, topic_id bigint unsigned NOT NULL, PRIMARY KEY(post_id,topic_id), KEY idx_topic(topic_id,post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_comments (
 id bigint unsigned NOT NULL AUTO_INCREMENT, public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, post_id bigint unsigned NOT NULL, author_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 root_comment_id bigint unsigned NOT NULL DEFAULT 0, reply_to_comment_id bigint unsigned DEFAULT NULL, body text NOT NULL, mentions json NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'published', row_revision bigint unsigned NOT NULL DEFAULT 1, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id), UNIQUE KEY uk_public(public_id), KEY idx_thread(post_id,root_comment_id,status,id), KEY idx_author(author_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_post_user_states (
 user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, post_id bigint unsigned NOT NULL, liked tinyint NOT NULL DEFAULT 0, subscription varchar(12) NOT NULL DEFAULT 'unset', hidden tinyint NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,post_id), KEY idx_post(post_id,liked,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_follows (
 follower_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, followee_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY(follower_user_id,followee_user_id), KEY idx_followee(followee_user_id,follower_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_user_mutes (
 user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, target_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, PRIMARY KEY(user_id,target_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_profile_options (
 user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, enabled tinyint NOT NULL DEFAULT 0, consent_version int NOT NULL DEFAULT 0, row_revision bigint unsigned NOT NULL DEFAULT 1,
 interests json NOT NULL, featured_posts json NOT NULL, comment_notifications_enabled tinyint NOT NULL DEFAULT 1, mention_notifications_enabled tinyint NOT NULL DEFAULT 1, PRIMARY KEY(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_operation_receipts (
 actor_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, request_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, request_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, result json NOT NULL,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY(actor_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_outbox (
 id bigint unsigned NOT NULL AUTO_INCREMENT, event_key varchar(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, kind varchar(32) NOT NULL,
 actor_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, post_id bigint unsigned DEFAULT NULL, comment_id bigint unsigned DEFAULT NULL, action_id bigint unsigned DEFAULT NULL, revision_id bigint unsigned DEFAULT NULL,
 status varchar(16) NOT NULL DEFAULT 'pending', recipient_cursor varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT '', attempts int NOT NULL DEFAULT 0, next_attempt_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 lease_until datetime(6) DEFAULT NULL, lease_token char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY(id), UNIQUE KEY uk_event(event_key), KEY idx_claim(status,next_attempt_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_event_recipients (
 dedupe_key varchar(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, outcome varchar(16) NOT NULL, notification_id char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 PRIMARY KEY(dedupe_key,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_content_reports (
 id bigint unsigned NOT NULL AUTO_INCREMENT, public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reporter_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, post_id bigint unsigned NOT NULL, comment_id bigint unsigned NOT NULL DEFAULT 0,
 reason varchar(32) NOT NULL, detail varchar(2000) NOT NULL, status varchar(16) NOT NULL DEFAULT 'pending', action_id bigint unsigned DEFAULT NULL,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY(id), UNIQUE KEY uk_public(public_id), UNIQUE KEY uk_report(reporter_id,post_id,comment_id), KEY idx_pending(status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_moderation_actions (
 id bigint unsigned NOT NULL AUTO_INCREMENT, public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL, subject_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 post_id bigint unsigned NOT NULL, comment_id bigint unsigned DEFAULT NULL, target_revision bigint unsigned NOT NULL, action varchar(24) NOT NULL, reason varchar(2000) NOT NULL,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY(id), UNIQUE KEY uk_public(public_id), KEY idx_subject(subject_id,id), KEY idx_post(post_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS community_appeals (
 id bigint unsigned NOT NULL AUTO_INCREMENT, public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, action_id bigint unsigned NOT NULL, author_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 body varchar(2000) NOT NULL, status varchar(16) NOT NULL DEFAULT 'pending', result varchar(2000) NOT NULL DEFAULT '', reviewed_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL, row_revision bigint unsigned NOT NULL DEFAULT 1,
 created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY(id), UNIQUE KEY uk_public(public_id), UNIQUE KEY uk_action(action_id,author_id), KEY idx_pending(status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

INSERT IGNORE INTO community_topics (slug,name_zh,name_en,sort_order) VALUES ('tips','使用技巧','Tips',10),('ideas','想法交流','Ideas',20),('help','使用求助','Help',30),('daily','日常分享','Daily life',40);

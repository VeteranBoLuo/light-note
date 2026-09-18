-- Topic presentation is independent of post revisions and payment campaigns.
CREATE TABLE IF NOT EXISTS community_topic_details (
 topic_id bigint unsigned NOT NULL,
 description_zh varchar(600) NOT NULL DEFAULT '', description_en varchar(600) NOT NULL DEFAULT '',
 official_pinned tinyint NOT NULL DEFAULT 0, post_task tinyint NOT NULL DEFAULT 0,
 row_revision bigint unsigned NOT NULL DEFAULT 1,
 updated_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
 updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(topic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
INSERT IGNORE INTO community_topics (slug,name_zh,name_en,enabled,sort_order)
VALUES ('mid-autumn','中秋','Mid-Autumn',0,-10);
INSERT IGNORE INTO community_topic_details(topic_id,description_zh,description_en,official_pinned,post_task)
SELECT id,'发布一篇带中秋话题的帖子，记录团圆、月色或你的节日故事。审核通过并公开后即完成任务。','Publish a post in the Mid-Autumn topic. Share a reunion, a moonlit moment, or your holiday story. The task is complete once your post is approved and public.',1,1
FROM community_topics WHERE slug='mid-autumn';

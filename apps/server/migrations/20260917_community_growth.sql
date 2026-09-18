CREATE TABLE IF NOT EXISTS community_accepted_answers (
 comment_id bigint unsigned NOT NULL,
 user_id varchar(36) NOT NULL,
 accepted_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY (comment_id), KEY idx_user (user_id,accepted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
INSERT IGNORE INTO community_topics(slug,name_zh,name_en,enabled,sort_order)
VALUES ('national-day','国庆','National Day',0,-9);
INSERT IGNORE INTO community_topic_details(topic_id,description_zh,description_en,official_pinned,post_task)
SELECT id,'把假期里的山河、见闻与小小收获，写成一篇旅行手记。','Share the landscapes, discoveries, and little joys of your holiday.',1,0
FROM community_topics WHERE slug='national-day';

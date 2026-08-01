-- PR2 成长任务数据模型：任务定义 + 用户完成状态。
-- title/description 保存 i18n key，实际展示文案由前端 locale 提供。
-- 历史完成态只补状态、不补经验，避免与旧版 profile_done / 资源创建奖励重复。

CREATE TABLE IF NOT EXISTS `growth_tasks` (
  `id` varchar(64) NOT NULL,
  `task_key` varchar(64) NOT NULL,
  `title` varchar(128) NOT NULL COMMENT 'i18n key, not display text',
  `description` varchar(160) NOT NULL COMMENT 'i18n key, not display text',
  `reward_exp` int unsigned NOT NULL DEFAULT 0,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint unsigned NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_growth_tasks_task_key` (`task_key`),
  KEY `idx_growth_tasks_enabled_order` (`enabled`, `sort_order`, `task_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成长任务定义';

CREATE TABLE IF NOT EXISTS `user_growth_tasks` (
  `user_id` varchar(64) NOT NULL,
  `task_key` varchar(64) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/completed',
  `completed_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `task_key`),
  KEY `idx_user_growth_tasks_status` (`user_id`, `status`, `completed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户成长任务状态';

INSERT INTO `growth_tasks`
  (`id`, `task_key`, `title`, `description`, `reward_exp`, `enabled`, `sort_order`)
VALUES
  ('growth-task-profile-avatar', 'profile_avatar', 'growth.tasks.profileAvatar.title', 'growth.tasks.profileAvatar.description', 50, 1, 10),
  ('growth-task-first-note', 'first_note', 'growth.tasks.firstNote.title', 'growth.tasks.firstNote.description', 50, 1, 20),
  ('growth-task-first-bookmark', 'first_bookmark', 'growth.tasks.firstBookmark.title', 'growth.tasks.firstBookmark.description', 30, 1, 30),
  ('growth-task-first-todo', 'first_todo', 'growth.tasks.firstTodo.title', 'growth.tasks.firstTodo.description', 30, 1, 40)
ON DUPLICATE KEY UPDATE
  `task_key` = VALUES(`task_key`),
  `title` = VALUES(`title`),
  `description` = VALUES(`description`),
  `reward_exp` = VALUES(`reward_exp`),
  `enabled` = VALUES(`enabled`),
  `sort_order` = VALUES(`sort_order`);

-- “知识回顾”目前只有浏览动作，不具备可验证的独立完成闭环，因此从成长任务中退役。
-- 保留既有用户状态与已发经验，只禁用任务定义，避免回收历史奖励。
UPDATE `growth_tasks`
SET `enabled` = 0
WHERE `task_key` = 'first_review';

INSERT IGNORE INTO `user_growth_tasks` (`user_id`, `task_key`, `status`, `completed_at`)
SELECT `user_id`, `task_key`, 'completed', `completed_at`
FROM (
  SELECT u.`id` AS `user_id`, 'profile_avatar' AS `task_key`,
         COALESCE(u.`create_time`, CURRENT_TIMESTAMP) AS `completed_at`
  FROM `user` u
  WHERE COALESCE(TRIM(u.`head_picture`), '') <> ''
    AND COALESCE(u.`del_flag`, 0) = 0
    AND COALESCE(u.`role`, 'user') NOT IN ('visitor', 'root')
  UNION ALL
  SELECT n.`create_by` AS `user_id`, 'first_note' AS `task_key`, MIN(n.`create_time`) AS `completed_at`
  FROM `note` n
  WHERE n.`del_flag` = 0
    AND NOT EXISTS (
      SELECT 1
      FROM `onboarding_seed_resources` osr
      WHERE osr.`user_id` = n.`create_by`
        AND osr.`resource_type` = 'note'
        AND osr.`resource_id` = n.`id`
    )
  GROUP BY n.`create_by`
  UNION ALL
  SELECT b.`user_id`, 'first_bookmark' AS `task_key`, MIN(b.`create_time`) AS `completed_at`
  FROM `bookmark` b
  WHERE b.`del_flag` = 0
    AND NOT EXISTS (
      SELECT 1
      FROM `onboarding_seed_resources` osr
      WHERE osr.`user_id` = b.`user_id`
        AND osr.`resource_type` = 'bookmark'
        AND osr.`resource_id` = b.`id`
    )
  GROUP BY b.`user_id`
  UNION ALL
  SELECT `user_id`, 'first_todo' AS `task_key`, MIN(`create_time`) AS `completed_at`
  FROM `todo_items`
  WHERE `del_flag` = 0
  GROUP BY `user_id`
) AS historical_tasks;

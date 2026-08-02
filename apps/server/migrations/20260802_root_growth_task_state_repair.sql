-- root 不参与成长经验奖励，但任务状态仍需反映真实业务事实。
-- 将 root 已满足条件的一次性任务幂等收口为“已完成、已领取”，避免工作台永久展示无法领取的任务。

INSERT INTO `user_growth_tasks` (`user_id`, `task_key`, `status`, `completed_at`, `claimed_at`)
SELECT `user_id`, `task_key`, 'completed', `completed_at`, `completed_at`
FROM (
  SELECT u.`id` AS `user_id`, 'profile_avatar' AS `task_key`,
         COALESCE(u.`create_time`, CURRENT_TIMESTAMP) AS `completed_at`
  FROM `user` u
  WHERE COALESCE(TRIM(u.`head_picture`), '') <> ''
    AND COALESCE(u.`del_flag`, 0) = 0
    AND u.`role` = 'root'
  UNION ALL
  SELECT n.`create_by` AS `user_id`, 'first_note' AS `task_key`, MIN(n.`create_time`) AS `completed_at`
  FROM `note` n
  INNER JOIN `user` u ON u.`id` = n.`create_by`
  WHERE n.`del_flag` = 0
    AND COALESCE(u.`del_flag`, 0) = 0
    AND u.`role` = 'root'
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
  INNER JOIN `user` u ON u.`id` = b.`user_id`
  WHERE b.`del_flag` = 0
    AND COALESCE(u.`del_flag`, 0) = 0
    AND u.`role` = 'root'
    AND NOT EXISTS (
      SELECT 1
      FROM `onboarding_seed_resources` osr
      WHERE osr.`user_id` = b.`user_id`
        AND osr.`resource_type` = 'bookmark'
        AND osr.`resource_id` = b.`id`
    )
  GROUP BY b.`user_id`
  UNION ALL
  SELECT t.`user_id`, 'first_todo' AS `task_key`, MIN(t.`create_time`) AS `completed_at`
  FROM `todo_items` t
  INNER JOIN `user` u ON u.`id` = t.`user_id`
  WHERE t.`del_flag` = 0
    AND COALESCE(u.`del_flag`, 0) = 0
    AND u.`role` = 'root'
  GROUP BY t.`user_id`
) AS `root_tasks`
ON DUPLICATE KEY UPDATE
  `status` = 'completed',
  `completed_at` = COALESCE(`completed_at`, VALUES(`completed_at`)),
  `claimed_at` = COALESCE(`claimed_at`, VALUES(`claimed_at`));

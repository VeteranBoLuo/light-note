-- 一次性成长任务改为“达成后手动领取”：claimed_at 是领取事实源。
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，因此先查询 information_schema 再执行动态 DDL。

SET @growth_task_claimed_at_missing := (
  SELECT IF(COUNT(*) = 0, 1, 0)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'user_growth_tasks'
    AND column_name = 'claimed_at'
);

SET @growth_task_claimed_at_ddl := IF(
  @growth_task_claimed_at_missing = 1,
  'ALTER TABLE `user_growth_tasks` ADD COLUMN `claimed_at` DATETIME DEFAULT NULL COMMENT ''用户主动领取经验的时间'' AFTER `completed_at`',
  'SELECT 1'
);
PREPARE growth_task_claimed_at_stmt FROM @growth_task_claimed_at_ddl;
EXECUTE growth_task_claimed_at_stmt;
DEALLOCATE PREPARE growth_task_claimed_at_stmt;

-- 新列上线前的 completed 记录已由旧流程自动发奖，或属于明确不补发的历史任务；
-- 只在本次新增列时标记为已领取，避免重复奖励。重复执行迁移不会触碰后续新达成任务。
UPDATE `user_growth_tasks`
SET `claimed_at` = COALESCE(`completed_at`, `update_time`, `create_time`, CURRENT_TIMESTAMP)
WHERE @growth_task_claimed_at_missing = 1
  AND `status` = 'completed'
  AND `claimed_at` IS NULL;

-- 同步 AI 产品知识：业务事件只负责达成，经验必须由用户主动领取。
UPDATE `knowledge_base`
SET `content` = REPLACE(
      `content`,
      '任务完成由对应业务事件自动检测，历史已发放奖励只补完成状态，不重复发奖',
      '任务达成由对应业务事件自动检测，经验奖励需要用户主动点击领取；历史已发放奖励只补完成与领取状态，不重复发奖'
    ),
    `updated_by` = NULL
WHERE `title` = '我的成长与积分系统'
  AND `content` LIKE '%任务完成由对应业务事件自动检测，历史已发放奖励只补完成状态，不重复发奖%';

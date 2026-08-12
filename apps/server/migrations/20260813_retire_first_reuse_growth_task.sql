-- 下线“首次知识复用”成长任务。
-- 仅禁用任务定义；历史完成状态与已经到账的经验保留，避免回收用户既得奖励。
UPDATE growth_tasks
SET enabled = 0
WHERE task_key = 'first_reuse';

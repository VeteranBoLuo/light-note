-- 2026-07-15 待处理帮助文档（MySQL 5.7 兼容）
-- 这是线上数据写入脚本，不随结构迁移或 deploy.sh 自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @action_center_id = '7bcbe44c-e762-4c87-97b4-d306e3306622';
SET @action_center_old_title = '快速收集与待整理箱怎么使用';
SET @action_center_legacy_title = '行动中心：待整理与待办怎么使用';
SET @action_center_title = '待处理：待整理与待办怎么使用';
SET @action_center_content = '<h2>待处理</h2><p>“待处理”把待整理资源和待办事项集中在同一页面，但两类数据彼此独立。</p><h3>待整理资源</h3><p>通过顶部“快速添加”保存网址、Markdown 文字或文件后，资源会立即创建并进入“待处理”。你可以补充标题、标签或位置后点击“整理完成”；也可以直接将不需要的资源移入回收站。</p><h3>待办</h3><p>在“待处理”切换到“待办” Tab，或在快速添加弹框选择“待办”，即可一次填写标题、说明、逐项清单、优先级、截止时间和提醒计划。清单在编辑时只负责录入，保存后回到“待处理”逐项勾选；完成待办只会进入已完成记录，只有手动删除才会移除待办，并且不会修改书签、笔记和文件。</p><p>提醒支持单次或周期计划，可选择通知中心、指定邮箱，或同时使用两种渠道。周期提醒需要设置起止时间和提醒间隔，并会在到达结束时间后自动停止。</p>';

-- 若旧标题和新标题因历史操作同时存在，不直接将两行改成同名，避免触发唯一索引冲突。
SET @action_center_exists = (
  SELECT COUNT(*) FROM knowledge_base WHERE title = @action_center_title
);

UPDATE knowledge_base
SET title = @action_center_title
WHERE title = @action_center_legacy_title AND @action_center_exists = 0;

SET @action_center_exists = (
  SELECT COUNT(*) FROM knowledge_base WHERE title = @action_center_title
);

UPDATE knowledge_base
SET title = @action_center_title
WHERE title = @action_center_old_title AND @action_center_exists = 0;

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @action_center_id, @action_center_title, @action_center_content,
  '帮助中心', 'public', 'html', 90, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE title = @action_center_title
);

UPDATE knowledge_base
SET content = @action_center_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 90,
    updated_by = NULL
WHERE title = @action_center_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE title = @action_center_title;

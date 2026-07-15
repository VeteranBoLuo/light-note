-- 2026-07-15 行动中心帮助文档（MySQL 5.7 兼容）
-- 这是线上数据写入脚本，不随结构迁移或 deploy.sh 自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @action_center_id = '7bcbe44c-e762-4c87-97b4-d306e3306622';
SET @action_center_old_title = '快速收集与待整理箱怎么使用';
SET @action_center_title = '行动中心：待整理与待办怎么使用';
SET @action_center_content = '<h2>行动中心</h2><p>行动中心把“待整理资源”和“待办事项”集中在同一页面处理，但两类数据彼此独立。</p><h3>待整理资源</h3><p>通过顶部“快速收集”保存网址、Markdown 文字或文件后，资源会立即创建并进入行动中心。你可以补充标题、标签或位置后点击“整理完成”；也可以直接将不需要的资源移入回收站。</p><h3>待办</h3><p>在行动中心切换到“待办” Tab，或在快速收集弹框选择“待办”，即可创建轻量任务。待办支持标题、说明、简易清单、优先级、截止时间和站内提醒；完成或删除待办不会修改书签、笔记和文件。</p><p>站内提醒会在设定时间发送到通知中心。首期不提供邮件提醒。</p>';

-- 若旧标题和新标题因历史操作同时存在，不直接将两行改成同名，避免触发唯一索引冲突。
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
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @action_center_id = '7bcbe44c-e762-4c87-97b4-d306e3306622';

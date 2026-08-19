-- 2026-08-19 待办系列暂停、恢复与删除帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @todo_series_actions_help_id = '40ce2f3b-d29c-4e8a-b68d-c725518f207a';
SET @todo_series_actions_help_title = '暂停、恢复和删除任务系列有什么区别';
SET @todo_series_actions_help_content = '<h1>可能继续时暂停，永久结束时删除</h1><p>任务系列只保留两类清楚的处理方式：临时停用使用“暂停系列”，永久结束使用“删除”并选择范围。待办菜单不再提供含义接近删除、但无法恢复的“停止整个系列”。</p><h2>暂停和恢复系列</h2><p>选择“暂停系列”后，系统会先要求确认。确认暂停会保留现有待办实例与系列规则，并暂停尚未触发的提醒和后续滚动生成。暂停后，待办卡片会显示“系列已暂停”，可以从同一位置选择“恢复系列”。恢复时，仍在未来的提醒会继续生效，暂停期间已经错过的提醒不会补发。</p><h2>删除任务系列</h2><p>删除系列实例时需要明确选择范围：</p><ul><li><b>仅删除本次：</b>只移除当前这一项，系列中的其他实例不受影响；</li><li><b>删除本次及以后：</b>移除当前项以及它之后尚未完成的实例，并结束原系列；</li><li><b>删除整个系列：</b>移除该系列全部尚未完成的实例并结束系列。</li></ul><p>删除本次及以后或删除整个系列都不会改写已经完成的历史，但结束后的系列不能从待办列表恢复。以后可能继续时应选择暂停，不要选择删除。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @todo_series_actions_help_id, @todo_series_actions_help_title, @todo_series_actions_help_content,
  '帮助中心', 'public', 'html', 922, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_series_actions_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_series_actions_help_title);

UPDATE knowledge_base
SET title = @todo_series_actions_help_title,
    content = @todo_series_actions_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 922,
    updated_by = NULL
WHERE id = @todo_series_actions_help_id OR title = @todo_series_actions_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @todo_series_actions_help_id;

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

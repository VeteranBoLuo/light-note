-- 2026-08-11 待办四象限视图帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @todo_matrix_help_id = '9d413c22-f8b3-4d7f-9c35-9f48d3e4a721';
SET @todo_matrix_help_title = '待办四象限如何自动分类';
SET @todo_matrix_help_content = '<h1>用四象限查看待办</h1><p>在待办页切换到“四象限”，可以按重要程度和紧急程度同时查看任务。它是列表、议程、日历之外的独立视图，不会改变原有视图的布局或排序规则。</p><h2>分类规则</h2><ul><li><b>重要</b>：优先级为“高”的待办；</li><li><b>普通或低优先</b>：优先级为“普通”或“低”的待办；</li><li><b>紧急</b>：已经逾期，或截止时间在今天；</li><li><b>不紧急</b>：截止时间在明天以后，或没有设置截止时间。</li></ul><p>因此页面依次展示“重要且紧急”“重要但不紧急”“普通或低优先且紧急”“普通或低优先且不紧急”四个区域。修改待办的优先级或截止时间后，它会自动移动到对应象限，不需要手工分类。</p><h2>筛选与操作</h2><p>四象限沿用待办的未完成、已完成、全部状态筛选，以及搜索和排序结果。象限内可以完成或重新打开待办、进入编辑，也可以按原有确认流程删除；首版不提供跨象限拖拽，避免拖动时隐式改写优先级或截止时间。</p><h2>移动端</h2><p>桌面和平板以 2×2 方式展示，手机按相同顺序纵向排列。页面只保留一层主滚动，避免象限内部滚动与手机手势冲突。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @todo_matrix_help_id, @todo_matrix_help_title, @todo_matrix_help_content,
  '帮助中心', 'public', 'html', 920, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_matrix_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_matrix_help_title);

UPDATE knowledge_base
SET title = @todo_matrix_help_title,
    content = @todo_matrix_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 920,
    updated_by = NULL
WHERE id = @todo_matrix_help_id OR title = @todo_matrix_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @todo_matrix_help_id;

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

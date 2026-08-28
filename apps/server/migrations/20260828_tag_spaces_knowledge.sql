-- 2026-08-28 标签空间帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @tag_spaces_help_id = 'e39f1fd9-bb2a-4b52-b916-548cf72fc10c';
SET @tag_spaces_help_title = '标签空间如何使用';
SET @tag_spaces_help_content = '<h1>每个标签都是一个空间</h1><p>“标签空间”用来集中回看同一标签下的书签、笔记和文件。它不是另一套专题或文件夹：你已经创建的每个标签，都会自动成为一个标签空间，不需要搬运或重复归类。</p><h2>浏览标签空间</h2><p>从顶部“标签空间”进入后，可以按书签、笔记或文件筛选，并按最近活动、资源数量或名称排序。空间卡片会显示资源数量和少量内容预览。默认列表不显示没有任何资源的空标签，它们没有被删除，仍可在“标签管理”中查看和处理。若只有空标签，页面会同时引导你管理标签或去给现有内容加标签。</p><h2>进入一个空间</h2><p>空间详情默认显示其中的资源，可按类型筛选，并在“最近更新”与“最近加入”之间切换；PC 端还可在当前空间内搜索，移动端继续使用顶栏全局搜索。“关联标签”来自与当前标签共同出现在同一资源上的其他标签，点击可直接进入对应空间。从详情返回时，之前的搜索、筛选、排序和滚动位置会保留。关系图和 AI 整理是可选的辅助视图。</p><h2>标签空间和标签管理的区别</h2><ul><li><b>标签空间：</b>用于浏览和回看内容；</li><li><b>标签管理：</b>用于新建、编辑、排序和删除标签。</li></ul><p>待办是行动对象，不属于标签空间；空间只聚合书签、笔记和文件。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @tag_spaces_help_id, @tag_spaces_help_title, @tag_spaces_help_content,
  '帮助中心', 'public', 'html', 922, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @tag_spaces_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @tag_spaces_help_title);

SET @tag_spaces_help_target_id = COALESCE(
  (SELECT id FROM knowledge_base WHERE id = @tag_spaces_help_id LIMIT 1),
  (SELECT id FROM knowledge_base WHERE title = @tag_spaces_help_title ORDER BY id ASC LIMIT 1)
);

UPDATE knowledge_base
SET title = @tag_spaces_help_title,
    content = @tag_spaces_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 922,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @tag_spaces_help_target_id;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @tag_spaces_help_target_id;

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

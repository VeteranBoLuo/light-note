-- 2026-08-28 统一标签模块帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @tag_spaces_help_id = 'e39f1fd9-bb2a-4b52-b916-548cf72fc10c';
SET @tag_spaces_help_title = '标签如何使用';
SET @tag_spaces_help_legacy_title = '标签空间如何使用';
SET @tag_spaces_help_content = '<h1>标签既是分类，也是内容入口</h1><p>顶部“标签”是统一入口：进入后会直接打开你最近使用的标签。每个标签都会自动汇集关联的书签、笔记和文件，不需要搬运内容，也没有另一套“标签空间”需要维护。</p><h2>从左侧目录切换标签</h2><p>桌面端左侧目录列出全部标签和各自的内容数量，点击即可切换。将鼠标移到标签上或右键，可以打开该标签、新建关联书签、编辑或删除；删除标签会解除它与现有资源的关联，请在确认框中核对后再操作。移动端继续通过标签入口与返回导航切换。</p><h2>在弹框中编辑标签</h2><p>新建或编辑不再跳转到单独页面。你可以在弹框中修改名称、标签说明和图标，并调整关联的书签、笔记与文件。标签说明会直接展示在标签档案中；不填写时会使用自动说明。</p><h2>查看与分析标签内容</h2><p>标签内容可按类型筛选，并在“最近更新”与“最近加入”之间切换；PC 端可在当前标签内搜索，移动端继续使用顶栏全局搜索。“常一起使用”展示与当前标签共同出现在同一资源上的其他标签。点击“分析标签”会立即读取当前关联资料并生成分析，是否保存为笔记由你在结果完成后决定。</p><p>待办是行动对象，不纳入标签的书签、笔记和文件聚合。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @tag_spaces_help_id, @tag_spaces_help_title, @tag_spaces_help_content,
  '帮助中心', 'public', 'html', 922, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @tag_spaces_help_id)
  AND NOT EXISTS (
    SELECT 1
    FROM knowledge_base
    WHERE title IN (@tag_spaces_help_title, @tag_spaces_help_legacy_title)
  );

SET @tag_spaces_help_target_id = COALESCE(
  (SELECT id FROM knowledge_base WHERE id = @tag_spaces_help_id LIMIT 1),
  (
    SELECT id
    FROM knowledge_base
    WHERE title IN (@tag_spaces_help_title, @tag_spaces_help_legacy_title)
    ORDER BY id ASC
    LIMIT 1
  )
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

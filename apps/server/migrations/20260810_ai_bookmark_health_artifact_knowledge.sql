-- 2026-08-10 AI 书签死链体检任务卡用户帮助（MySQL 5.7 兼容、幂等）。
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_bookmark_health_help_id = 'c8d699dc-4d66-4a9a-b680-dce81308cf5d';
SET @ai_bookmark_health_help_title = '轻笺智域：书签死链体检会真正执行吗';
SET @ai_bookmark_health_help_content = '<h2>真实体检与历史结果</h2><p>当你说“我有哪些书签链接失效了”或明确要求开始、重新体检时，轻笺智域会启动一轮真实链接检查，而不是把上次保存的结果冒充为刚刚检查。只有你明确询问“上次结果”或“当前进度”时，助手才只读取现有记录。</p><h2>任务卡片</h2><p>体检卡会展示真实的总数、已检查数、正常、疑似失效和无法判断数量，并在后台任务执行时自动刷新。疑似失效不等于绝对失效；需登录、反爬或限流的站点可能暂时无法判断。</p><h2>重新体检</h2><p>体检结束后可直接在卡片上点击“重新体检”。若同一账号的体检已在执行，重复请求会复用当前任务，不会重复扫描。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_bookmark_health_help_id, @ai_bookmark_health_help_title, @ai_bookmark_health_help_content,
  'FAQ', 'public', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_bookmark_health_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_bookmark_health_help_id);

UPDATE knowledge_base
SET content = @ai_bookmark_health_help_content,
    category = 'FAQ',
    status = 'public',
    type = 'html',
    sort = 96,
    updated_by = NULL
WHERE id = @ai_bookmark_health_help_id OR title = @ai_bookmark_health_help_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id = @ai_bookmark_health_help_id OR title = @ai_bookmark_health_help_title;

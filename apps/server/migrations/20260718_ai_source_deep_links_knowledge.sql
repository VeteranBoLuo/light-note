-- 2026-07-18 轻笺智域参考来源与深链跳转帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；部署后按上线流程显式执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_source_help_id = '6d949ad7-6143-4c99-9c44-e869f51a9310';
SET @ai_source_help_title = '轻笺智域：参考来源与跳转';
SET @ai_source_help_content = '<h2>什么是参考来源</h2><p>轻笺智域在读取你的资源或轻笺知识库后，会在回答下方显示“参考来源”。来源卡片保留资源类型、名称和必要摘录，帮助你核对回答依据。只有本轮实际读取或操作过的资源才会进入来源列表。</p><h2>哪些来源可以点击</h2><ul><li><b>帮助中心文章</b>：只有知识库中分类为“帮助中心”且状态为公开的文章可以点击，并在轻笺内打开对应文章；地址栏带文章 ID，刷新、复制链接或前进后退后仍能保留当前文章。</li><li><b>笔记</b>：进入对应笔记详情。</li><li><b>书签</b>：正常链接优先打开原网页；死链但已有正文快照时打开快照；没有可打开网址时进入书签编辑页。</li><li><b>云文件与 AI 文档</b>：已保存到云空间的文件按文件 ID 精确打开预览；临时上传文档仅在只读预览地址仍有效时可打开。</li><li><b>云文件夹与标签</b>：分别进入对应文件夹或标签详情。</li><li><b>网页检索结果</b>：打开本轮读取的 HTTP/HTTPS 网页。</li></ul><h2>为什么有些来源不能点击</h2><p>FAQ、系统行为等非帮助中心公开知识只作为回答依据展示，不会跳转到 SEO 公开页。来源缺少稳定 ID、临时预览地址已过期、网址协议不安全，或资源已删除、无权访问时，卡片也会保持只读，不会猜测并跳转到其他资源。轻笺会在服务端校验资源归属；来源卡片不会绕过原有权限。</p><h2>旧会话兼容</h2><p>升级前保存在当前浏览器里的帮助来源可能没有文章 ID。再次进入对话时，轻笺只会按完整标题精确匹配知识库中的帮助中心公开文章；无法唯一确认或不属于帮助中心的旧来源仍保持只读，避免跳错内容。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_source_help_id, @ai_source_help_title, @ai_source_help_content,
  '帮助中心', 'public', 'html', 103, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_source_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_source_help_id);

UPDATE knowledge_base
SET content = @ai_source_help_content, category = '帮助中心', status = 'public', type = 'html', sort = 103, updated_by = NULL
WHERE id = @ai_source_help_id OR title = @ai_source_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @ai_source_help_id OR title = @ai_source_help_title;

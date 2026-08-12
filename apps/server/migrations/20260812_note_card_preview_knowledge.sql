-- 2026-08-12 笔记卡片图片预览帮助文档同步（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @feature_marker = 'data-ln-feature="note-card-image-preview-v1"';
SET @feature_section = '<section data-ln-feature="note-card-image-preview-v1"><h2>卡片图片预览</h2><p>使用卡片视图时，如果笔记正文开头包含已上传图片，卡片会显示轻量封面缩略图。缩略图会延迟加载，不会阻塞标题和摘要；图片加载失败时自动退回纯文本卡片。列表视图不加载封面，打开笔记后仍显示原始清晰图片。</p></section>';

UPDATE knowledge_base
SET content = CONCAT(COALESCE(content, ''), @feature_section), updated_by = NULL
WHERE (id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理')
  AND LOCATE(@feature_marker, COALESCE(content, '')) = 0;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理';

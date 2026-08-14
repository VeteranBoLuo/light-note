-- 2026-08-13 手绘笔记第一版帮助文档同步（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @feature_marker = 'data-ln-feature="drawing-note-mvp-v1"';
SET @feature_section = '<section data-ln-feature="drawing-note-mvp-v1"><h2>手绘笔记</h2><p>在笔记库点击“新建笔记”，选择“手绘笔记”即可进入画布。第一版支持画笔、整笔橡皮擦、文本输入或粘贴、选择移动、画布平移、缩放、撤销与重做；修改会自动保存，也可以手动保存。</p><p>单篇手绘笔记可导出 PNG 图片或原始 JSON；批量导出时请选择“原格式”，手绘会以 JSON 文件加入 ZIP。第一版暂不支持插入图片、手写识别、AI 读取或编辑画布正文、保存为模板，以及转换为 HTML、Markdown 或 PDF。</p></section>';

UPDATE knowledge_base
SET content = CONCAT(COALESCE(content, ''), @feature_section), updated_by = NULL
WHERE (id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理')
  AND LOCATE(@feature_marker, COALESCE(content, '')) = 0;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理';

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

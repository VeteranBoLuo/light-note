-- 2026-08-14 手绘预览与文本再次编辑帮助文档同步（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @feature_marker = 'data-ln-feature="drawing-note-preview-v1"';
SET @feature_section = '<section data-ln-feature="drawing-note-preview-v1"><h3>预览与再次编辑文本</h3><p>手绘笔记在笔记库卡片中会显示轻量内容缩略图；缩略图只在卡片接近可见区域时加载，不影响普通笔记列表速度。打开“预览”后，可以沿同一条页面滚动条查看完整画纸直到页面底部。</p><p>需要修改画布里的文字时，先切换到“选择与移动”工具，点击文字选中，再点击一次即可原位编辑；按 Enter 完成，使用 Shift + Enter 可以输入换行。</p></section>';
SET @history_marker = 'data-ln-feature="drawing-note-history-v1"';
SET @history_section = '<section data-ln-feature="drawing-note-history-v1"><h3>查看与恢复手绘历史版本</h3><p>在手绘笔记右上角打开“历史版本”，选择一条记录即可预览当时的完整画板。切换到“差异”后，桌面端会并排展示当前内容与历史版本，移动端上下展示；两个画板使用相同比例，并显示新增、删除、修改或移动的元素数量。</p><p>确认需要回到旧内容后，点击“恢复此版本”。恢复前的当前内容仍会自动留档，之后可以再次恢复。</p></section>';

UPDATE knowledge_base
SET content = CONCAT(COALESCE(content, ''), @feature_section), updated_by = NULL
WHERE (id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理')
  AND LOCATE(@feature_marker, COALESCE(content, '')) = 0;

UPDATE knowledge_base
SET content = CONCAT(COALESCE(content, ''), @history_section), updated_by = NULL
WHERE (id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理')
  AND LOCATE(@history_marker, COALESCE(content, '')) = 0;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理';

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

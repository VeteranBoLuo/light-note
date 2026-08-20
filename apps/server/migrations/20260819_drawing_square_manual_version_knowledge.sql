-- 2026-08-19 方形手绘画布与手动历史版本帮助文档（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @drawing_square_marker = 'data-ln-feature="drawing-square-v2"';
SET @drawing_square_section = '<section data-ln-feature="drawing-square-v2"><h3>方形手绘画布与保存版本</h3><p>手绘笔记现在使用正方形画纸。进入编辑时，画纸会根据当前窗口的可用宽度和高度自动缩放并居中，不会为了展示完整画纸而出现横向滚动条。放大后可使用手形工具平移查看画纸四边。</p><p>旧的竖版手绘会自动居中显示在方形画纸中，不会缩放、拉伸或裁剪原有内容。编辑、预览、历史版本和分享页使用相同的方形比例。笔记库卡片也会缩放整张画纸，不会把单个小笔画放大铺满预览区。</p><p>笔记会继续自动保存。如果希望立即留下一个可恢复的历史点，点击右上角“保存版本”，或按 Command/Ctrl+S。该操作会先保存当前修改，再将已保存内容加入历史版本。</p></section>';

UPDATE knowledge_base
SET content = CONCAT(COALESCE(content, ''), @drawing_square_section), updated_by = NULL
WHERE (id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理')
  AND LOCATE(@drawing_square_marker, COALESCE(content, '')) = 0;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理';

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

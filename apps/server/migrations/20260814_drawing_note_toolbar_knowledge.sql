-- 2026-08-14 手绘工具栏、局部橡皮擦与导出帮助文档同步（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @toolbar_marker = 'data-ln-feature="drawing-note-toolbar-v1"';
SET @toolbar_section = '<section data-ln-feature="drawing-note-toolbar-v1"><h3>颜色、尺寸、橡皮擦与导出</h3><p>手绘工具栏中的颜色和大小各占一个入口：点击颜色可以选择常用颜色或打开系统调色盘自定义颜色；点击大小可以选择常用值，也可以拖动滑杆连续调节画笔粗细、橡皮擦大小或文字大小。</p><p>橡皮擦只清除圆形轨迹覆盖的笔画区域，不会再删除整条连续线条；调整橡皮擦大小可以控制清除范围。文字属于可编辑对象，需要使用“选择与移动”选中文字后按删除键移除。</p><p>PNG 和原始 JSON 导出统一放在笔记右上角“更多 → 导出”中，电脑与移动端入口一致。PNG 适合直接查看和分享，JSON 会保留手绘元素与坐标，适合原格式备份。</p></section>';

UPDATE knowledge_base
SET content = CONCAT(COALESCE(content, ''), @toolbar_section), updated_by = NULL
WHERE (id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理')
  AND LOCATE(@toolbar_marker, COALESCE(content, '')) = 0;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理';

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

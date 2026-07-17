-- 2026-07-17 笔记置顶帮助文档（MySQL 5.7 兼容）
-- 这是线上业务数据写入脚本，不随结构迁移或部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @note_pin_id = '751bb5be-df9d-4a47-a736-1bf116b42c41';
SET @note_pin_title = '笔记库：置顶常用笔记与调整顺序';
SET @note_pin_content = '<h2>置顶常用笔记</h2><p>笔记库支持同时置顶多篇常用笔记。桌面端在笔记卡片或列表项上点击鼠标右键，选择“置顶”或“取消置顶”；移动端点击卡片右上角的“更多”菜单即可操作。</p><p>置顶笔记会排在当前笔记列表、搜索结果或标签筛选结果的顶部，并显示绿色“置顶”标记。拖动笔记可以调整同一分组内的顺序，但置顶笔记始终位于普通笔记之前。置顶和取消置顶不会改变笔记的最后编辑时间。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @note_pin_id, @note_pin_title, @note_pin_content,
  '帮助中心', 'public', 'html', 98, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @note_pin_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @note_pin_id);

UPDATE knowledge_base
SET content = @note_pin_content, category = '帮助中心', status = 'public', type = 'html', sort = 98, updated_by = NULL
WHERE id = @note_pin_id OR title = @note_pin_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE title = @note_pin_title;

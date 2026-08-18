-- 2026-08-18 云空间排序、移动标签配置与编辑器斜杠命令帮助知识（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @note_marker = 'data-ln-feature="editor-slash-command-v1"';
SET @note_section = '<section data-ln-feature="editor-slash-command-v1"><h2>使用斜杠快捷插入</h2><p>编辑 HTML 富文本或 Markdown 笔记时，在新一行输入 <code>/</code> 可以打开快捷菜单。继续输入“标题”“待办”“代码”等关键词可以筛选，也可以使用方向键选择、回车确认、Esc 关闭。菜单支持正文、三级标题、无序/有序列表、待办、引用、代码块、分割线和表格。</p><p>Markdown 选择代码块后会先选择语言，再插入带语言标记的代码围栏；富文本会打开代码示例对话框，可以选择语言并获得语法高亮。斜杠菜单不会替代手机系统的长按复制、粘贴和全选。</p></section>';

UPDATE knowledge_base
SET content = CONCAT(COALESCE(content, ''), @note_section), updated_by = NULL
WHERE (id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理')
  AND LOCATE(@note_marker, COALESCE(content, '')) = 0;

SET @cloud_guide_id = '17f87850-5d2d-4e09-9b7a-5d59cc95ef18';
SET @cloud_guide_title = '云空间排序与文件标签';
SET @cloud_guide_content = '<h1>云空间排序与文件标签</h1><h2>给文件排序</h2><p>云空间可以按最新上传、最早上传、名称 A–Z、名称 Z–A、大小从大到小或从小到大排序。电脑端的排序入口在卡片/列表切换旁边；中等宽度屏幕会收起文字以给页面标题留出空间，悬停仍可查看当前排序。列表视图也可以直接点击文件名或大小表头，两处使用同一排序状态。手机端从页面右上角“更多”进入“文件排序”。排序会作用于当前文件夹与文件类型筛选下的全部文件，而不只是已经滚动加载的部分。</p><h2>关联文件标签</h2><p>打开文件的“关联标签”后，顶部会紧凑显示当前文件和已选标签数量；已选标签可以横向滑动并逐个移除。搜索框、新建标签和底部确认操作保持可见，共享标签列表占用主要空间并独立滚动。点击标签行可以绑定或解绑，实色描边、勾选图标和状态文字会同时表示当前绑定状态。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @cloud_guide_id, @cloud_guide_title, @cloud_guide_content,
  '帮助中心', 'public', 'html', 99, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @cloud_guide_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @cloud_guide_id);

UPDATE knowledge_base
SET content = @cloud_guide_content, category = '帮助中心', status = 'public', type = 'html', sort = 99, updated_by = NULL
WHERE id = @cloud_guide_id OR title = @cloud_guide_title;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN ('808f738e-3d5c-11f1-b2ac-fa163e50acdb', @cloud_guide_id)
   OR title IN ('笔记管理', @cloud_guide_title);

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

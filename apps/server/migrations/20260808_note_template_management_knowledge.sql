-- 2026-08-08 自定义笔记模板管理帮助文档（MySQL 5.7 兼容）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。
-- 执行后需等待知识检索缓存刷新或重启后端。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @note_template_help_id = '5b2e8f43-97a1-4d6f-b8c2-0e7a3159d64c';
SET @note_template_help_title = '自定义笔记模板：创建、编辑与复用';
SET @note_template_help_content = '<h2>统一管理自定义模板</h2><p>进入「笔记库」，点击顶部的「模板管理」；也可以在新建笔记的「我的模板」页签或笔记右上角「更多」菜单进入。这里可以搜索、预览、编辑、复制和删除自己保存的模板。</p><h3>创建与使用</h3><p>点击「新建模板」，选择富文本或 Markdown 格式，填写模板名称、默认笔记标题、说明和正文后保存。模板名称用于模板列表，默认笔记标题会在使用模板新建笔记时自动填入，两者可以不同。回到模板预览后点击「使用此模板」即可新建笔记。</p><h3>编辑与复制</h3><p>模板保存后格式不会改变；需要另一种格式时请新建对应模板。编辑模板只影响以后从它创建的笔记，不会改变以前已经创建的笔记。复制模板会连同标题、说明和正文一起生成副本，适合在相近模板上调整。</p><h3>版本冲突</h3><p>如果同一模板已在其他标签页或设备修改，系统不会静默覆盖。可以加载最新版本，也可以把当前内容另存为副本后再比较整理。</p><h3>数量与删除</h3><p>每个账号最多保存 20 个自定义模板。删除模板不会删除或改动已经用它创建的笔记；模板删除后不能从回收站恢复。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @note_template_help_id, @note_template_help_title, @note_template_help_content,
  '帮助中心', 'public', 'html', 98, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @note_template_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @note_template_help_id);

UPDATE knowledge_base
SET content = @note_template_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 98,
    updated_by = NULL
WHERE id = @note_template_help_id OR title = @note_template_help_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id = @note_template_help_id OR title = @note_template_help_title;

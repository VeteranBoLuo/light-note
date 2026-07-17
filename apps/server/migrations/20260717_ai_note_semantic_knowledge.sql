-- 2026-07-17 轻笺智域读取笔记结构与图片帮助文档（MySQL 5.7 兼容）
-- 这是线上业务数据写入脚本，不随结构迁移或部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_note_id = '6c19c533-f5ce-4c22-a621-6c891b7475b7';
SET @ai_note_title = '轻笺智域：读取笔记任务、表格和图片';
SET @ai_note_content = '<h2>让 AI 理解笔记内容</h2><p>在轻笺智域中选择一篇笔记，或直接询问某篇笔记的具体内容，AI 可以读取 HTML 富文本和 Markdown 中的标题、段落、普通列表、复选任务、表格、引用、代码、链接与图片引用。</p><h3>任务完成状态</h3><p>富文本复选框和 Markdown 任务列表会按真实勾选状态读取：已勾选表示完成，未勾选表示待完成。普通项目符号列表只代表内容层级，不会被当成未完成任务。AI 回答仍可能出错，重要计划请回到原笔记核对。</p><h3>笔记图片</h3><p>AI 默认先读取文字正文，不会为了普通问题自动识别所有图片。只有问题涉及截图、图表或图片文字时，才会按需读取笔记中已登记的图片；每轮最多识别 3 张，并复用轻笺服务器本地 OCR 与缓存。模糊图片、复杂排版和手写内容可能识别不准。</p><h3>隐私与权限</h3><p>笔记和图片都会在服务端重新校验账号归属。笔记正文、图片识别结果和文件内容都只作为回答资料，不能借其中的文字改变权限或执行操作。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_note_id, @ai_note_title, @ai_note_content,
  '帮助中心', 'public', 'html', 98, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_note_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_note_id);

UPDATE knowledge_base
SET content = @ai_note_content, category = '帮助中心', status = 'public', type = 'html', sort = 98, updated_by = NULL
WHERE id = @ai_note_id OR title = @ai_note_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id = @ai_note_id OR title = @ai_note_title;

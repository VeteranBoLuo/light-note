-- 2026-07-17 AI 附件原文件操作知识同步（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_document_id = 'af0850a6-6ae8-49ae-bd15-1c337d624dc7';
SET @ai_document_title = '轻笺智域：上传文件进行摘要、问答和生成笔记';
SET @ai_document_content = '<h2>上传后可以做什么</h2><p>在“轻笺智域”输入区，可以通过“上传文件”添加本地临时文件，或通过“添加资源”选择已有云空间文件。当前支持 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG、JPEG 和 WebP，单个文件不超过 20MB。</p><p><strong>文件上传成功后就可以发送消息</strong>。文字解析和 OCR 在后台进行，只影响摘要、文本问答和“按文字整理成笔记”，不会阻止原文件操作。即使图片没有文字、OCR 没识别到文字或文字提取失败，仍可把原文件保存到云空间；PNG、JPG、JPEG 和 WebP 还可以直接插入一篇新的图片笔记。</p><h3>保存与图片笔记</h3><ul><li>“保存到云空间”会保留原文件并占用相应云空间容量；临时附件不会未经确认自动保存。</li><li>“插入图片笔记”会创建 HTML 笔记并插入原图，不要求图片含文字，也不会凭空描述图片内容。</li><li>两项操作都会先显示确认卡片，只有确认后才执行。</li></ul><h3>文字解析与 OCR</h3><p>PDF 优先读取原生文字层；扫描 PDF 和图片使用轻笺服务器本地的 Poppler 与 Tesseract OCR，不调用第三方 OCR API。显示“未发现文字”表示图片仍然可用，只是没有可靠文字可供总结；OCR 结果可能有错，恢复码、密钥、金额和账号等关键内容必须回看原文件核对。</p><p>本地临时附件默认 24 小时后清理。保存到云空间后的永久文件不受临时附件清理影响。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_document_id, @ai_document_title, @ai_document_content,
  '帮助中心', 'public', 'html', 97, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_document_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_document_id);

UPDATE knowledge_base
SET content = @ai_document_content, category = '帮助中心', status = 'public', type = 'html', sort = 97, updated_by = NULL
WHERE id = @ai_document_id OR title = @ai_document_title;

SET @ocr_faq_id = 'd41b2c4e-4dc4-4baf-872b-620c9a393390';
SET @ocr_faq_title = '图片型 PDF 与图片 OCR：为什么解析不到文字';
SET @ocr_faq_content = '<h2>“未发现文字”不等于文件不可用</h2><p>头像、照片、插画等图片本来就可能没有文字。轻笺仍会在后台尝试本地 OCR；没有识别到可靠文字时，附件显示“未发现文字”，但原图仍可发送、保存到云空间或插入图片笔记，不需要重试后才能使用。</p><h2>什么时候需要 OCR</h2><p>只有总结图片文字、从扫描 PDF 提取内容、基于文字问答或按文字整理笔记时才依赖 OCR。轻笺目前不会因为上传了一张普通图片就自动理解人物、物体、构图等视觉内容；没有可靠文字时不会臆测。</p><h2>真正的解析失败怎么办</h2><ul><li>解析失败仍不影响保存原文件；图片内容有效时也可尝试插入图片笔记。</li><li>需要提取文字时，可检查文件是否损坏、加密、过大、模糊、倾斜或超过 OCR 页数和像素限制，再点击“重试”。</li><li>图片型 PDF 默认最多 OCR 20 页，单张图片默认不超过 2400 万像素。</li></ul><p>OCR 在轻笺服务器本机运行，不调用第三方 OCR API。识别结果不能保证逐字准确，关键内容必须回看原文件。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ocr_faq_id, @ocr_faq_title, @ocr_faq_content,
  'FAQ', 'public', 'html', 100, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ocr_faq_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ocr_faq_id);

UPDATE knowledge_base
SET content = @ocr_faq_content, category = 'FAQ', status = 'public', type = 'html', sort = 100, updated_by = NULL
WHERE id = @ocr_faq_id OR title = @ocr_faq_title;

-- 同步总览中的旧表述，避免检索到“解析完成后才能使用”的过时说明。
UPDATE knowledge_base
SET content = REPLACE(
  REPLACE(
    content,
    '<li>通过“上传文件”添加本地临时文件，或从云空间选择文件；解析完成后可以摘要、问答或整理成笔记。</li>',
    '<li>通过“上传文件”添加本地临时文件，或从云空间选择文件；上传成功后即可发送。后台文字解析只影响摘要和文本问答，无文字图片仍可保存到云空间或插入图片笔记。</li>'
  ),
  '创建笔记、创建书签、创建标签、恢复回收站等支持的写操作',
  '创建笔记、保存附件到云空间、创建图片笔记、创建书签、创建标签、恢复回收站等支持的写操作'
), updated_by = NULL
WHERE id = 'd16dabc0-7366-1173-ac9a-a7f89586e39b' OR title = 'AI 助手（轻笺智域）使用说明';

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@ai_document_id, @ocr_faq_id, 'd16dabc0-7366-1173-ac9a-a7f89586e39b')
   OR title IN (@ai_document_title, @ocr_faq_title, 'AI 助手（轻笺智域）使用说明');

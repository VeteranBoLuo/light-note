-- 2026-07-17 AI 文件助手本地 OCR 帮助文档（MySQL 5.7 兼容）
-- 这是线上业务数据写入脚本，不随结构迁移或部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_document_id = 'af0850a6-6ae8-49ae-bd15-1c337d624dc7';
SET @ai_document_title = '轻笺智域：上传文件进行摘要、问答和生成笔记';
SET @ai_document_content = '<h2>让 AI 读取文件</h2><p>在“轻笺智域”输入区，可以通过“上传文件”添加本地临时文件，或通过“添加资源”选择已有云空间文件；两种方式都会进入相同的正文解析与来源引用流程。当前支持 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG 和 WebP，单个文件不超过 20MB。</p><h3>图片型 PDF 与图片 OCR</h3><p>PDF 会优先读取原生文字层；如果整份 PDF 只有扫描图片，轻笺会在自己的服务器上自动进行本地 OCR。PNG、JPG、JPEG 和 WebP 图片也可以直接识别中英文与数字。OCR 不调用第三方 OCR API；图片型 PDF 默认最多识别 20 页，过大、模糊或复杂排版可能导致识别变慢或出现错字。</p><p>文件需要先完成异步解析，附件显示“已就绪”后才能发送问题。你可以总结内容、提取结论，也可以点击“整理成笔记”；真正创建笔记前仍会展示二次确认。OCR 文字不能保证逐字准确，恢复码、密钥、金额、账号等敏感或关键内容必须回看原文件核对。</p><p>临时附件不会自动保存到云空间，默认 24 小时后清理。OCR 阶段完全在轻笺服务器本机运行；当你继续让轻笺智域总结或问答时，轻笺只会把回答需要的文字片段发送给当前配置的 AI 服务商，并在回答下方展示真实的文件名与页码、章节、行号或段落来源。</p>';

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

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id = @ai_document_id OR title = @ai_document_title;

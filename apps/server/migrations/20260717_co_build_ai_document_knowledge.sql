-- 2026-07-17 共建轻笺与 AI 文件助手帮助文档（MySQL 5.7 兼容）
-- 这是线上业务数据写入脚本，不随结构迁移或部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @co_build_id = '42f064d4-847e-4c65-bd63-597e6a27dca1';
SET @co_build_title = '共建轻笺：提交建议与查看开发进度';
SET @co_build_content = '<h2>共建轻笺</h2><p>“共建轻笺”是公开的产品建议与进度看板，不是聊天室或社交社区。你可以查看轻笺团队的官方规划、经过审核的用户建议、开发者答复和上线记录。</p><p>桌面端游客可以从顶部导航进入；登录后入口位于个人中心。登录用户可以提交产品建议、为公开建议点击“我也需要”，并补充自己提交的建议。建议会先由开发者审核，通过后才公开。</p><p>账号、安全、故障截图或联系方式等私密内容请继续使用“意见反馈”，不会自动进入公开看板。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @co_build_id, @co_build_title, @co_build_content,
  '帮助中心', 'public', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @co_build_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @co_build_id);

UPDATE knowledge_base
SET content = @co_build_content, category = '帮助中心', status = 'public', type = 'html', sort = 96, updated_by = NULL
WHERE id = @co_build_id OR title = @co_build_title;

SET @ai_document_id = 'af0850a6-6ae8-49ae-bd15-1c337d624dc7';
SET @ai_document_title = '轻笺智域：上传文件进行摘要、问答和生成笔记';
SET @ai_document_content = '<h2>让 AI 读取文件</h2><p>在“轻笺智域”输入区，可以通过“上传文件”添加本地临时文件，或通过“添加资源”选择已有云空间文件；两种方式都会进入相同的正文解析与来源引用流程。当前支持 TXT、Markdown、CSV、带文本层的 PDF 和 DOCX，单个文件不超过 20MB。</p><p>文件需要先完成异步解析，附件显示“已就绪”后才能发送问题。你可以总结内容、提取结论，也可以点击“整理成笔记”；真正创建笔记前仍会展示二次确认。</p><p>临时附件不会自动保存到云空间，默认 24 小时后清理。轻笺只会把回答需要的文本片段发送给 AI 服务商，并在回答下方展示真实的文件名与页码、章节、行号或段落来源。</p>';

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
WHERE title IN (@co_build_title, @ai_document_title);

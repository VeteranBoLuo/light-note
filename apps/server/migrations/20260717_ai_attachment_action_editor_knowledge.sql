-- 2026-07-17 AI 附件自定义动作帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_document_id = 'af0850a6-6ae8-49ae-bd15-1c337d624dc7';
SET @ai_document_title = '轻笺智域：上传文件进行摘要、问答和生成笔记';
SET @ai_document_content = '<h2>上传后可以做什么</h2><p>在“轻笺智域”输入区，可以通过“上传文件”添加本地临时文件，或通过“添加资源”选择已有云空间文件。当前支持 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG、JPEG 和 WebP，单个文件不超过 20MB。</p><p><strong>文件上传成功后就可以发送消息</strong>。文字解析和 OCR 在后台进行，只影响摘要、文本问答和“按文字整理成笔记”，不会阻止原文件操作。即使图片没有文字、OCR 没识别到文字或文字提取失败，仍可保存原文件；PNG、JPG、JPEG 和 WebP 还可以创建图片笔记。</p><h2>自定义保存到云空间</h2><p>点击“保存到云空间”后，输入区会展示专属编辑器，可以自由修改保存文件名、选择已有目标文件夹，也可以直接输入文件夹名称；两项都不填则保存到云空间根目录。不能修改原文件扩展名，也不会在名称重复时猜测文件夹。也可直接提问，例如“把这张图保存为测试.png，放到项目资料文件夹”；用户最终发送或填写的文件名和文件夹才是准确参数。</p><h2>文件夹不存在时怎么办</h2><p>如果按名称没有找到目标文件夹，助手会显示选择卡，提供“新建该文件夹并保存”“改存云空间根目录”和“选择其他已有文件夹”等选项。点击选项只确定下一步，不会立即写入；涉及新建文件夹或保存文件时，仍需核对最终确认卡并点击“确认执行”。新建文件夹和保存文件在同一事务中完成，失败时不会留下只建了文件夹却没保存文件的半成品。重复点击或网络响应丢失时会沿用第一次选择，不会重复创建或重复保存。</p><h2>通用选择卡</h2><p>轻笺智域支持单选、多选和确认型选择卡。推荐项会明确标注；可以使用鼠标、触控或键盘选择。需要修改详细参数时，选择“其他文件夹”等编辑项会返回专属编辑器；取消则不会执行后续写操作。选择卡与最终确认卡职责分开：选择卡负责澄清方案，确认卡负责授权真正的数据写入。</p><h2>创建图片笔记</h2><p>点击“创建图片笔记”后，可在专属编辑器填写笔记标题和可选图片说明。该操作会新建一篇 HTML 笔记并插入原图，不是把图片插入某篇已有笔记，也不存在“笔记文件夹”选项。</p><h2>确认与修改</h2><p>上述两个快捷写操作会直接使用结构化参数生成一次性确认卡，不需要 AI 再猜一次名称，也不消耗一次 AI 提问额度。确认卡会列出最终目标和影响；只有点击“确认执行”才写入数据。如果参数不对，点击“修改参数”会作废旧确认并返回编辑器，修改后再生成新确认，防止旧参数被重复执行。若确认时遇到断网、超时或操作仍在处理中，卡片会保留“安全重试”；使用同一确认重试只查询并回放原结果，不会重复保存文件或创建笔记。结果尚不确定时不会再显示取消和修改入口，避免误把正在执行的操作当成已取消。</p><h2>总结文件与整理成笔记</h2><p>“总结文件”和“整理成笔记”仍是可编辑的提问建议。点击时不会覆盖输入区已有草稿，用户可以继续补充结构、长度、标题等要求，发送始终以最终文本为准。</p><h2>文字解析与 OCR</h2><p>PDF 优先读取原生文字层；没有文字层时由文档 Worker 使用服务器本地 Poppler 逐页渲染，再调用本地 Tesseract OCR，不调用第三方 OCR API。显示“未发现文字”表示图片仍可使用，只是没有可靠文字可供总结；OCR 结果可能有错，恢复码、密钥、金额和账号等关键内容必须回看原文件核对。</p><p>本地临时附件默认 24 小时后清理。保存到云空间后的永久文件不受临时附件清理影响。</p>';

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

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @ai_document_id OR title = @ai_document_title;

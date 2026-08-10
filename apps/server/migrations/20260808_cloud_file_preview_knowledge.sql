-- 2026-08-08 云空间新增在线预览类型帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @cloud_preview_id = '9d8fc5aa-8f67-4b31-99b5-27a9af070df4';
SET @cloud_preview_title = '云空间支持在线预览哪些文件？';
SET @cloud_preview_content = '<h1>云空间文件在线预览</h1><p>在云空间或文件分享页打开文件，可以直接预览常见图片、PDF、文本、音视频和新版 Office 文件。部分格式会在后台准备预览，首次打开需要稍等片刻；处理完成后会复用结果。</p><h2>新增支持的格式</h2><ul><li><strong>压缩包目录：</strong>ZIP、RAR/RAR5、7Z、TAR、TGZ/TAR.GZ、TBZ2/TAR.BZ2、TXZ/TAR.XZ、GZ、BZ2、XZ。只展示目录、文件名、大小和加密提示，不在线解压或打开包内文件。</li><li><strong>旧版办公文档：</strong>DOC、XLS、PPT、RTF、ODT、ODS、ODP。服务端会把文件转换为私有 PDF 后预览；复杂字体、动画、宏、嵌入对象或特殊排版可能与原软件存在差异，原文件仍可下载核对。</li><li><strong>文本类：</strong>TSV、JSONL/NDJSON、SRT、VTT、ICS、VCF、DIFF、PATCH，与已有 TXT、Markdown、CSV、JSON、代码等文本格式一样直接查看。</li></ul><h2>安全与限制</h2><p>压缩包预览不会在浏览器或服务器解压内容，只读取受限目录清单；路径异常的条目会被跳过。加密压缩包、多卷包、损坏文件、超出文件大小或目录数量限制的文件可能无法预览。旧版办公文档的转换在隔离临时目录中执行，超时或输出过大时会停止。预览失败不会影响原文件，仍可以下载后使用本地软件打开。</p><h2>分享文件</h2><p>分享页支持相同的新增预览类型。受密码、有效期和下载次数保护的分享仍会先完成原有校验；一次预览会按一次下载授权计数，预览过程中的状态查询不会重复扣减。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @cloud_preview_id, @cloud_preview_title, @cloud_preview_content,
  '帮助中心', 'public', 'html', 97, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @cloud_preview_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @cloud_preview_id);

UPDATE knowledge_base
SET content = @cloud_preview_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 97,
    updated_by = NULL
WHERE id = @cloud_preview_id OR title = @cloud_preview_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @cloud_preview_id OR title = @cloud_preview_title;

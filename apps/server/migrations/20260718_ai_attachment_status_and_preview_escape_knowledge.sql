-- 2026-07-18 AI 附件状态反馈与预览 Escape 层级帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；部署后按上线流程显式执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_attachment_status_help_id = 'c75bd005-924d-4006-ab93-f987234a7d36';
SET @ai_attachment_status_help_title = '轻笺智域：附件处理状态与预览快捷键';
SET @ai_attachment_status_help_content = '<h2>上传后为什么会显示动态状态</h2><p>文件上传成功后，原文件和文字提取是两层独立能力。附件卡片会分别显示文件大小、“原文件可用”、文字提取状态以及是否已保存到云空间。等待或正在提取文字时会显示轻量点状动画和文字明暗变化，提醒处理仍在继续；该动画不代表百分比，也不会虚构剩余时间。系统开启“减少动态效果”后，动画会自动停用。</p><h2>各状态代表什么</h2><ul><li><b>等待提取文字 / 正在提取文字：</b>原文件已经可发送、保存；依赖文字的总结、问答和整理功能仍在后台准备。</li><li><b>文字已提取：</b>可以继续总结文件、基于文字提问或整理成笔记。</li><li><b>未发现文字：</b>图片或扫描件没有识别到可靠文字，原文件仍可保存，图片仍可创建图片笔记。</li><li><b>文字提取失败：</b>只表示文字解析失败，不会把已经上传的原文件判定为不可用；需要文字时可以重试。</li></ul><h2>预览时按 Esc 会关闭哪一层</h2><p>从轻笺智域来源卡片打开云空间文件后，图片、PDF、音视频、Office、文本等文件会进入统一的顶层预览。第一次按 <code>Esc</code> 只关闭当前预览，AI 抽屉会保留；再按一次才关闭 AI 抽屉。长按 <code>Esc</code> 产生的重复按键不会连续穿透并关闭两层，无需额外记忆新的快捷键。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_attachment_status_help_id, @ai_attachment_status_help_title, @ai_attachment_status_help_content,
  '帮助中心', 'public', 'html', 104, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_attachment_status_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_attachment_status_help_id);

UPDATE knowledge_base
SET content = @ai_attachment_status_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 104,
    updated_by = NULL
WHERE id = @ai_attachment_status_help_id OR title = @ai_attachment_status_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @ai_attachment_status_help_id OR title = @ai_attachment_status_help_title;

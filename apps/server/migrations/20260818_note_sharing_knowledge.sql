-- 2026-08-18 笔记/目录分享帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；Schema 由 20260818_note_sharing.sql 管理。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @note_share_help_id = '7f6695c0-47dc-4a32-8a85-21c9308fa599';
SET @note_share_help_title = '分享笔记与目录：只读链接、访问码和权限范围';
SET @note_share_help_content = '<h1>分享笔记与目录</h1><p>打开笔记库或笔记详情的“分享”，可以创建一个独立的只读链接。分享页不会显示编辑工具栏、标签、历史版本、导出或 AI 助手，访客不需要登录轻笺即可阅读。</p><h2>单篇与目录分享</h2><ul><li><strong>仅当前笔记：</strong>链接只能打开这一篇，即使它有子页面也不会一起公开。</li><li><strong>当前目录及子页面：</strong>链接可以浏览当前页面和它下面的全部页面，并在阅读页左侧或手机底部抽屉中切换页面和正文大纲。</li></ul><p>目录范围会跟随最新页面树变化：之后在该目录中新建或移入的页面会进入分享，移出的页面会立即离开分享。为了避免误公开，向正在分享的目录新建或移动页面时，轻笺会先要求你明确确认。</p><h2>有效期与访问保护</h2><p>链接可设置 1 天、7 天或 30 天有效期；默认 7 天。还可以设置 4～12 位字母或数字访问码，以及 1～10000 次的最大首次访问次数。读者在同一个短时阅读会话里切换子页面不会重复计数。</p><h2>管理、撤销与轮换</h2><p>同一篇笔记可以保留多个分享链接，每条链接独立计算有效期和访问次数。你可以随时撤销某条链接；“轮换”会立即撤销旧链接并按当前设置生成新链接，旧地址不能继续使用。出于安全原因，轻笺不会再次展示旧链接的完整令牌，因此新建或轮换时会自动复制新地址，请妥善保存。</p><h2>正文与站内引用</h2><p>分享页支持 HTML、Markdown 和手绘笔记的只读展示。正文中的笔记引用只有在同一个分享范围内才能打开；云文件和书签仍保持原来的私人权限，不会因为出现在分享笔记里自动公开。链接已撤销、过期、达到访问上限，或分享根页面已删除时，访客会看到不可用提示。</p><h2>隐私说明</h2><p>分享链接使用不可猜测的随机令牌，服务端只保存令牌摘要；公开页面不会被搜索引擎收录，也不会把分享地址作为来源信息发送给外部站点。访问事件只保存用于安全审计的不可逆访客摘要，不保存原始访问码或正文。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @note_share_help_id, @note_share_help_title, @note_share_help_content,
  '帮助中心', 'public', 'html', 99, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @note_share_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @note_share_help_id);

UPDATE knowledge_base
SET title = @note_share_help_title,
    content = @note_share_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 99,
    updated_by = NULL
WHERE id = @note_share_help_id OR title = @note_share_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @note_share_help_id OR title = @note_share_help_title;

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

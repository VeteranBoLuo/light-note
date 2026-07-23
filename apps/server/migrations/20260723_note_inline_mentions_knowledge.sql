-- 2026-07-23 笔记内联提及与反向引用帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。
-- 执行前必须获得 owner 对线上知识库数据写入的单独授权。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @note_mentions_help_id = 'a7f2e7f9-9a63-4c5a-9b80-b9148f5b7a32';
SET @note_mentions_help_title = '笔记如何 @ 提及书签、笔记和文件，以及查看反向引用';
SET @note_mentions_help_content = '<h1>笔记中的资源提及与反向引用</h1><p>轻笺笔记可以把自己的书签、其他笔记和云空间文件作为可保存的站内引用。引用用于把知识关联起来：原笔记保留可读标题和标准链接，资源改名后打开笔记会显示最新名称。</p><h2>如何提及资源</h2><ol><li>在富文本或 Markdown 编辑区的正常正文位置输入 <code>@</code>；</li><li>在弹出的搜索面板中输入关键词，选择自己的书签、笔记或文件；</li><li>轻笺会插入一条普通站内链接。保存、刷新或在两种编辑模式间切换后，引用仍会保留。</li></ol><p>邮箱地址、网址、代码块和已有链接里的 <code>@</code> 不会触发资源选择。Markdown 源文本会保持为普通链接，预览区会显示为资源卡片样式。</p><h2>名称更新与失效引用</h2><p>资源仍存在且属于你时，打开来源笔记会显示资源当前名称；这不会静默改写笔记里原先保存的标题。资源被移入回收站、删除或你不再有访问权限时，引用会显示“已失效引用 · 原标题”，并且不能跳转。资源恢复后会自动恢复为可用状态。</p><h2>如何打开引用</h2><p>点击可用引用可在轻笺内打开对应详情：笔记进入笔记详情，书签进入书签详情，文件进入云空间中的对应文件。轻笺不会把普通外部网址猜测成你的资源引用。</p><h2>查看哪些笔记引用了资源</h2><p>打开一条笔记、书签详情或文件预览时，如果它被其他笔记引用，会看到折叠的“被这些笔记引用”区域。默认只显示最近更新的前 5 篇来源笔记；展开后可按“查看更多”继续加载。反向引用只展示来源笔记标题、更新时间和站内跳转，不会展示笔记正文或其他用户的信息。</p><h2>隐私与权限</h2><p>你只能搜索、解析和查看自己拥有且未删除的资源。复制其他账号的站内地址不会创建可用引用或反向引用；对于不存在、已删除和无权访问的目标，轻笺统一按不可用处理，不透露资源是否真实存在。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @note_mentions_help_id, @note_mentions_help_title, @note_mentions_help_content,
  '帮助中心', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @note_mentions_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @note_mentions_help_id);

UPDATE knowledge_base
SET content = @note_mentions_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 95,
    updated_by = NULL
WHERE id = @note_mentions_help_id OR title = @note_mentions_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @note_mentions_help_id OR title = @note_mentions_help_title;

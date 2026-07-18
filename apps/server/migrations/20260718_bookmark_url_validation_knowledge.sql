-- 2026-07-18 书签地址智能识别、严格校验与失效提示（MySQL 5.7 兼容）
-- 线上知识库幂等更新脚本；部署后按上线流程显式执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @bookmark_url_help_id = '7fc948ab-311c-4b0d-aa79-1978876eb973';
SET @bookmark_url_help_title = '收藏书签：地址识别、纠错与失效提示';
SET @bookmark_url_help_content = '<h2>粘贴网址或分享文案</h2><p>新增书签、快捷收藏和待处理快速收集都支持完整 HTTP/HTTPS 地址、裸域名，以及包含网址的分享文案。轻笺会用确定性规则识别最终地址；AI 只负责补全名称、描述和标签，不会替你私自决定要保存哪个网址。</p><h3>识别到一个或多个候选时</h3><p>如果输入里含有宣传文字、协议后空格、重复协议头或多个网址，页面会展示候选地址供你选择。选择候选本身不会立即保存；在轻笺智域中还会继续展示最终写入确认。</p><h3>错误和疑似失效如何处理</h3><ul><li>没有有效候选、非 HTTP/HTTPS 协议或结构明显错误：直接阻止保存，请修改地址。</li><li>格式正确但域名不存在，或页面返回 404/410：提示“可能错误或已经失效”，推荐返回修改，也允许你明确选择“仍然保存”。</li><li>站点超时、反爬、需要登录或服务器无法验证：不武断判定失效，仍可正常收藏。</li></ul><p>智能识别无法读取网页内容时，轻笺会明确提示名称和描述仅根据网址推测，请在保存前自行核对。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @bookmark_url_help_id, @bookmark_url_help_title, @bookmark_url_help_content,
  '帮助中心', 'public', 'html', 101, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @bookmark_url_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @bookmark_url_help_id);

UPDATE knowledge_base
SET content = @bookmark_url_help_content, category = '帮助中心', status = 'public', type = 'html', sort = 101, updated_by = NULL
WHERE id = @bookmark_url_help_id OR title = @bookmark_url_help_title;

SET @bookmark_url_faq_id = 'e374f871-8799-4611-9a72-f361b7e64d70';
SET @bookmark_url_faq_title = '为什么书签地址不能保存，或提示可能失效';
SET @bookmark_url_faq_content = '<h2>不能保存</h2><p>这通常表示输入中没有识别到有效的 HTTP/HTTPS 地址，或地址含有错误协议、账号密码、异常拼接等结构问题。请复制浏览器地址栏里的真实网址后重试。</p><h2>识别到候选地址</h2><p>从社交平台复制的内容常包含“网址放这里”、宣传语、空格或多个链接。轻笺不会直接猜测，而会列出候选让你选择，避免收藏到错误页面。</p><h2>提示可能错误或失效</h2><p>域名无法解析，或页面返回 404/410 时会出现提醒。推荐先返回修改；如果是仅登录可见、单页应用深层路由或你确认地址无误，可以选择“仍然保存”。该提示是风险提醒，不会把所有暂时打不开的网站都判成死链。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @bookmark_url_faq_id, @bookmark_url_faq_title, @bookmark_url_faq_content,
  'FAQ', 'public', 'html', 102, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @bookmark_url_faq_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @bookmark_url_faq_id);

UPDATE knowledge_base
SET content = @bookmark_url_faq_content, category = 'FAQ', status = 'public', type = 'html', sort = 102, updated_by = NULL
WHERE id = @bookmark_url_faq_id OR title = @bookmark_url_faq_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id IN (@bookmark_url_help_id, @bookmark_url_faq_id)
   OR title IN (@bookmark_url_help_title, @bookmark_url_faq_title);

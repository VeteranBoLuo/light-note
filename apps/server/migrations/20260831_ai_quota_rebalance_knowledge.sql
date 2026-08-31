-- 2026-08-31 AI 每日等级额度重平衡后的公开帮助同步。
-- MySQL 5.7 兼容、幂等；只更新 knowledge_base，不改业务 Schema。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_title = 'AI 额度、等级与加油包';
SET @ai_quota_content = '<!-- data-ln-policy:ai-quota-v2 --><h1>AI 额度、用量明细与永久余额</h1><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>按自然日重置，优先消耗。</li><li><strong>永久加油余额（永久余额）：</strong>不会每日重置，今日额度用完后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><h2>每日等级额度</h2><p>游客按设备每日 5 万 tokens，并受可信网络额度保护。登录账号按成长等级计算：Lv.1～5 分别为 20、22、24、26、28 万；Lv.6～9 为 31、34、37、40 万；Lv.10～15 为 45、50、56、62、70、80 万 tokens/日。user、test 与 root 都按各自真实成长等级计算，账号角色不会额外放大 AI 额度。</p><h2>永久余额来源</h2><ul><li><strong>积分兑换：</strong>240 积分兑换 30 万，420 积分兑换 60 万 tokens。</li><li><strong>资源商店：</strong>从 <a href="/store?category=ai">资源商店</a> 购买 AI 或组合套餐，按下单时展示的确切额度到账。</li></ul><p>需要自愿赞助项目维护时可前往 <a href="/support">支持轻笺</a>；需要增加 AI 额度时请从资源商店选择对应套餐。历史已发放的永久余额继续保留，不会追回。</p><h2>统一计费与逐次明细</h2><p>笔记、书签、文件、待办、标签整理和知识工坊等真实模型调用共享同一份额度。用户主调用按实际 token 结算；缓存、无材料和本地确定性处理不扣，受限协议修复由平台承担。点击消耗记录可按真实顺序查看 Provider、模型、输入、输出和合计 token、耗时、承担方及脱敏修复原因；页面不保存或显示问题、正文、标题、网址、图片和模型回答。额度不足会在下一次模型调用前停止。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT @ai_quota_id, @ai_quota_title, @ai_quota_content,
       '帮助中心', 'public', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_quota_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_quota_title);

UPDATE knowledge_base
SET content = @ai_quota_content,
    category = '帮助中心', status = 'public', type = 'html', sort = 96,
    admin_archived = 0, updated_by = NULL
WHERE id = @ai_quota_id OR title = @ai_quota_title;

COMMIT;

SELECT id, title, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @ai_quota_id OR title = @ai_quota_title;

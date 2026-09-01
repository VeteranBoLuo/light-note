-- 2026-07-24 AI 额度扩容帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。
-- 执行前必须获得 owner 对线上知识库数据写入的单独授权。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- 同步当前 C4 积分经济，避免旧脚本重跑后恢复过期价格。
UPDATE knowledge_base
SET content = '在“我的成长 → 奖励”可以兑换积分商品、查看头像框，并参加每日惊喜或积分抽奖。

## AI 永久余额
- AI 轻量加油包：240 积分，永久增加 30 万 tokens。
- AI 加油包：420 积分，永久增加 60 万 tokens。
- 每日等级额度用完后会继续消耗永久余额；永久余额不会跨天过期，两款都没有等级门槛。

## 永久扩容
- 128MB：500 积分；512MB：1600 积分；2GB：5200 积分，兑换后永久叠加。

## 每日惊喜与积分抽奖
- 每日惊喜不消耗积分，只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进付费保底。
- 积分抽奖单抽 170、十连 1600；每 10 次付费抽至少获得一项稀有奖励。
- 补签卡最多持有 2 张；已满仓时付费抽命中补签卡会改为 120 积分补偿。'
WHERE id = '11a21140-7ecf-117e-8c23-96d5e1f6a052'
   OR title = '积分商店与积分抽奖';

SET @ai_quota_help_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_help_title = 'AI 额度、等级与加油包';
SET @ai_quota_help_content = '<h1>AI 额度、用量明细与永久余额</h1><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>按自然日重置，优先消耗。</li><li><strong>永久余额：</strong>不会每日重置，今日额度用完后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><h2>每日等级额度</h2><p>游客按设备每日 20 万 tokens，并受可信网络额度保护。登录账号按成长等级计算：Lv.1～5 分别为 30、35、40、45、50 万；Lv.6～9 为 60、70、80、90 万；Lv.10～15 为 105、120、140、160、180、200 万 tokens/日。user、test 与 root 都按各自真实成长等级计算，账号角色不会额外放大 AI 额度。</p><h2>永久余额来源</h2><ul><li><strong>积分兑换：</strong>240 积分兑换 30 万，420 积分兑换 60 万 tokens，兑换后直接入永久余额。</li><li><strong>赞助感谢：</strong>赠送策略启用后的爱发电合格实付订单，每实付 ¥1 赠送 10 万 tokens；¥6、¥18、¥50 分别赠送 60 万、180 万、500 万。</li></ul><p>赞助赠送以爱发电 API 核验、可信订单归属和实际支付金额为准；策略启用前的历史订单不追溯赠送，超过 ¥200 的单笔赠送需管理员复核，退款或订单反转进入人工处理且不会把余额扣成负数。</p><h2>统一计费与明细</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等真实模型调用共享同一份额度。用户主调用按实际 token 结算；缓存、无材料和本地确定性处理不扣，受限输出协议修复由平台承担。可在“AI 用量与计费”页核对今日额度、永久余额、当前总可用以及每次模型调用详情；额度不足会在下一次模型调用前停止。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_quota_help_id, @ai_quota_help_title, @ai_quota_help_content,
  '帮助中心', 'public', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_quota_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_quota_help_id);

UPDATE knowledge_base
SET content = @ai_quota_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    updated_by = NULL
WHERE (id = @ai_quota_help_id OR title = @ai_quota_help_title)
  AND LOCATE('data-ln-policy:ai-quota-v', COALESCE(content, '')) = 0;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @ai_quota_help_id OR title = @ai_quota_help_title;

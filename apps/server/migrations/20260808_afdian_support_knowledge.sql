-- 2026-08-08 爱发电支持入口帮助知识（MySQL 5.7、幂等）
-- 仅同步 knowledge_base 内容，不修改结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @support_help_id = '80b98e73-84c0-4d0a-8dc2-5bd993bc59ae';
SET @support_help_title = '如何自愿支持轻笺';
SET @support_help_content = '<h1>轻笺会一直免费</h1><p>轻笺的核心记录与整理能力永久免费。赞助完全自愿，不会解锁专属核心功能，也不会影响未赞助用户的权益；永久 AI 额度是对实际赞助的量化感谢。</p><h2>从哪里进入</h2><p>电脑端打开右上角个人中心菜单，选择“支持轻笺”；手机端进入底部“我的”，选择“支持轻笺”。也可以直接访问 <a href="/support">/support</a>。支持页提供 ¥6、¥18、¥50 和自选金额入口，支付、订单与退款由爱发电处理。</p><h2>永久 AI 额度怎样赠送</h2><p>赠送策略启用后的合格订单，按爱发电 API 核验的实际支付金额计算：每实付 ¥1 赠送 10 万 tokens，¥6、¥18、¥50 分别赠送 60 万、180 万、500 万。额度确认后直接进入永久余额，不会跨天过期，并在每日成长等级额度用完后自动使用。</p><h2>归属、历史与复核</h2><p>登录轻笺后从支持页下单会生成安全的随机归属凭证；也可选择关联爱发电账号来归并真实订单。策略启用前的历史订单不会追溯赠送；缺少可信时间或归属冲突的订单等待核对，单笔实付超过 ¥200 需要管理员人工复核，不会静默截断赠送数量。</p><h2>退款与隐私</h2><p>退款、订单反转或已入账后的金额和归属变化会进入人工处理，不会把永久余额扣成负数。轻笺不保存付款码、支付密码、订单留言或收货地址；排行榜身份默认匿名，只有本人明确同意才公开，并可撤回。</p><h2>除了赞助还能怎样支持</h2><p>持续使用、提交反馈、分享轻笺或参与共建，都是对这个免费项目很珍贵的支持。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @support_help_id, @support_help_title, @support_help_content,
  '帮助中心', 'public', 'html', 97, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @support_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @support_help_title);

UPDATE knowledge_base
SET content = @support_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 97,
    updated_by = NULL
WHERE id = @support_help_id OR title = @support_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @support_help_id OR title = @support_help_title;

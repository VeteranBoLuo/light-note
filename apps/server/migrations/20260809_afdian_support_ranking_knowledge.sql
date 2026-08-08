-- 2026-08-09 爱发电真实赞助排行榜规划帮助知识（MySQL 5.7、幂等）
-- 仅同步 knowledge_base 内容，不修改结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @support_help_id = '80b98e73-84c0-4d0a-8dc2-5bd993bc59ae';
SET @support_help_title = '如何自愿支持轻笺';
SET @support_help_content = '<h1>轻笺会一直免费</h1><p>轻笺的核心记录与整理能力永久免费。赞助完全自愿，不会解锁核心功能，也不会影响未赞助用户的使用权益。</p><h2>从哪里进入</h2><p>电脑端打开右上角个人中心菜单，选择“支持轻笺”；手机端进入底部“我的”，选择“支持轻笺”。也可以直接访问 <a href="/support">/support</a>。</p><h2>如何完成支持</h2><p>支持页提供 6 元/月、18 元/月、50 元/月和自选金额四种入口。点击后会离开轻笺并打开对应的爱发电官方下单页。支付、订单、退款和平台规则由爱发电处理，轻笺不会在支持页收集银行卡、付款码、支付宝或微信密码。</p><h2>赞助排行榜与成长奖励</h2><p>爱发电订单暂未与轻笺账号关联，因此积分、经验和徽章暂不自动发放。轻笺会在完成 Webhook 与 API 真实订单同步后提供月度榜与累计榜；仅展示赞助者明确同意公开的信息，并支持匿名、不参与和撤回，不使用模拟数据。排行榜不会形成核心功能的付费门槛。</p><h2>除了赞助还能怎样支持</h2><p>持续使用、提交反馈、分享轻笺或参与共建，都是对这个免费项目很珍贵的支持。</p>';

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

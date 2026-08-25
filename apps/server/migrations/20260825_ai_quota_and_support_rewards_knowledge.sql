-- AI 等级额度、C4 积分包与爱发电永久额度赠送公开知识同步。
-- MySQL 5.7 兼容、幂等；只更新 knowledge_base，不修改 Schema。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_title = 'AI 额度、等级与加油包';
SET @ai_quota_content = '<h1>AI 额度、用量明细与永久余额</h1><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>按自然日重置，优先消耗。</li><li><strong>永久余额：</strong>不会每日重置，今日额度用完后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><h2>每日等级额度</h2><p>游客按设备每日 20 万 tokens，并受可信网络额度保护。登录账号按成长等级计算：Lv.1～5 分别为 30、35、40、45、50 万；Lv.6～9 为 60、70、80、90 万；Lv.10～15 为 105、120、140、160、180、200 万 tokens/日。user、test 与 root 都按各自真实成长等级计算，账号角色不会额外放大 AI 额度。</p><h2>永久余额来源</h2><ul><li><strong>积分兑换：</strong>240 积分兑换 30 万，420 积分兑换 60 万 tokens，兑换后直接入永久余额。</li><li><strong>赞助感谢：</strong>赠送策略启用后的爱发电合格实付订单，每实付 ¥1 赠送 10 万 tokens；¥6、¥18、¥50 分别赠送 60 万、180 万、500 万。</li></ul><p>赞助赠送以爱发电 API 核验、可信订单归属和实际支付金额为准；策略启用前的历史订单不追溯赠送，超过 ¥200 的单笔赠送需管理员复核，退款或订单反转进入人工处理且不会把余额扣成负数。</p><h2>统一计费与逐次明细</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等真实模型调用共享同一份额度。用户主调用按实际 token 结算；缓存、无材料和本地确定性处理不扣，受限输出协议修复由平台承担。点击消耗记录可按真实顺序查看 Provider、模型、输入/输出/合计 token、耗时、承担方及脱敏修复原因；页面不保存或显示问题、正文、标题、网址、图片和模型回答。额度不足会在下一次模型调用前停止。</p>';
SET @ai_quota_content = REPLACE(@ai_quota_content, '<strong>永久余额：</strong>', '<strong>永久加油余额（永久余额）：</strong>');
SET @ai_quota_content = CONCAT(@ai_quota_content, '<h2>逐次调用详情</h2><p>修复由后端代码门禁判定，并显示脱敏原因；历史上未保存具体原因的记录会明确标注，不会猜测。页面仍不保存或显示问题、正文、标题、网址、图片和模型回答。</p>');

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

SET @points_id = '11a21140-7ecf-117e-8c23-96d5e1f6a052';
SET @points_content = '在“我的成长 → 奖励”可以兑换积分商品、查看头像框，并参加每日惊喜或积分抽奖。

## AI 永久余额
- AI 轻量加油包：240 积分，永久增加 30 万 tokens。
- AI 加油包：420 积分，永久增加 60 万 tokens。
- 每日等级额度用完后会继续消耗永久余额；永久余额不会跨天过期，两款都没有等级门槛。

## 永久扩容
- 128MB：500 积分；512MB：1600 积分；2GB：5200 积分，兑换后永久叠加。

## 每日惊喜与积分抽奖
- 每日惊喜不消耗积分，只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进付费保底。
- 积分抽奖单抽 170、十连 1600；每 10 次付费抽至少获得一项稀有奖励。
- 补签卡最多持有 2 张；已满仓时付费抽命中补签卡会改为 120 积分补偿。';

UPDATE knowledge_base
SET content = @points_content,
    category = '帮助中心', status = 'public', type = 'markdown', sort = 98,
    admin_archived = 0, updated_by = NULL
WHERE id = @points_id OR title = '积分商店与积分抽奖';

SET @support_id = '80b98e73-84c0-4d0a-8dc2-5bd993bc59ae';
SET @support_title = '如何自愿支持轻笺';
SET @support_content = '<h1>轻笺会一直免费</h1><p>轻笺的核心记录与整理能力永久免费。赞助完全自愿，不会解锁专属核心功能，也不会影响未赞助用户的权益；永久 AI 额度是对实际赞助的量化感谢。</p><h2>从哪里进入</h2><p>电脑端打开右上角个人中心菜单，选择“支持轻笺”；手机端进入底部“我的”，选择“支持轻笺”。也可以直接访问 <a href="/support">/support</a>。支持页提供 ¥6、¥18、¥50 和自选金额入口，支付、订单与退款由爱发电处理。</p><h2>永久 AI 额度怎样赠送</h2><p>赠送策略启用后的合格订单，按爱发电 API 核验的实际支付金额计算：每实付 ¥1 赠送 10 万 tokens，¥6、¥18、¥50 分别赠送 60 万、180 万、500 万。额度确认后直接进入永久余额，不会跨天过期，并在每日成长等级额度用完后自动使用。</p><h2>归属、历史与复核</h2><p>登录轻笺后从支持页下单会生成安全的随机归属凭证；也可选择关联爱发电账号来归并真实订单。策略启用前的历史订单不会追溯赠送；缺少可信时间或归属冲突的订单等待核对，单笔实付超过 ¥200 需要管理员人工复核，不会静默截断赠送数量。</p><h2>退款与隐私</h2><p>退款、订单反转或已入账后的金额和归属变化会进入人工处理，不会把永久余额扣成负数。轻笺不保存付款码、支付密码、订单留言或收货地址；排行榜身份默认匿名，只有本人明确同意才公开，并可撤回。</p><h2>除了赞助还能怎样支持</h2><p>持续使用、提交反馈、分享轻笺或参与共建，都是对这个免费项目很珍贵的支持。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT @support_id, @support_title, @support_content,
       '帮助中心', 'public', 'html', 97, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @support_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @support_title);

UPDATE knowledge_base
SET content = @support_content,
    category = '帮助中心', status = 'public', type = 'html', sort = 97,
    admin_archived = 0, updated_by = NULL
WHERE id = @support_id OR title = @support_title;

COMMIT;

SELECT id, title, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@ai_quota_id, @points_id, @support_id)
   OR title IN (@ai_quota_title, '积分商店与积分抽奖', @support_title)
ORDER BY sort DESC, title;

-- 自愿支持与资源商店拆分后的公开帮助同步。
-- MySQL 5.7 兼容、幂等；只更新 knowledge_base，不改业务 Schema。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_title = 'AI 额度、等级与加油包';
SET @ai_quota_content = '<h1>AI 额度、用量明细与永久余额</h1><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>按自然日重置，优先消耗。</li><li><strong>永久加油余额（永久余额）：</strong>不会每日重置，今日额度用完后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><h2>每日等级额度</h2><p>游客按设备每日 20 万 tokens，并受可信网络额度保护。登录账号按成长等级计算：Lv.1～5 分别为 30、35、40、45、50 万；Lv.6～9 为 60、70、80、90 万；Lv.10～15 为 105、120、140、160、180、200 万 tokens/日。user、test 与 root 都按各自真实成长等级计算，账号角色不会额外放大 AI 额度。</p><h2>永久余额来源</h2><ul><li><strong>积分兑换：</strong>240 积分兑换 30 万，420 积分兑换 60 万 tokens。</li><li><strong>资源商店：</strong>从 <a href="/store?category=ai">资源商店</a> 购买 AI 或组合套餐，按下单时展示的确切额度到账。</li></ul><p>需要自愿赞助项目维护时可前往 <a href="/support">支持轻笺</a>；需要增加 AI 额度时请从资源商店选择对应套餐。历史已按旧规则发放的余额继续保留，不会追回。</p><h2>统一计费与逐次明细</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等真实模型调用共享同一份额度。用户主调用按实际 token 结算；缓存、无材料和本地确定性处理不扣，受限协议修复由平台承担。点击消耗记录可按真实顺序查看 Provider、模型、输入/输出/合计 token、耗时、承担方及脱敏修复原因；页面不保存或显示问题、正文、标题、网址、图片和模型回答。额度不足会在下一次模型调用前停止。</p>';

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
SET @points_title = '积分商店与积分抽奖';
SET @points_content = '在“成长中心 → 资产与奖励 → 兑换”可以兑换积分商品，也可以从同一区域进入资源商店购买永久资产。

## AI 永久余额
- AI 轻量加油包：240 积分，永久增加 30 万 tokens。
- AI 加油包：420 积分，永久增加 60 万 tokens。
- 每日等级额度用完后会继续消耗永久余额；永久余额不会跨天过期，两款都没有等级门槛。

## 永久扩容
- 128MB：500 积分；512MB：1600 积分；2GB：5200 积分，兑换后永久叠加。
- 三档扩容包每个账号各限兑换一次；历史直接积分兑换计入对应档位，抽奖或运营赠送空间不占资格。

## 积分与人民币购买
- 积分来自站内使用和任务，不与人民币建立兑换汇率。
- 资源商店提供 AI、空间和组合套餐；购买不进入支持者榜。
- “支持轻笺”用于自愿赞助项目维护；购买 AI 或空间请使用资源商店。

## 每日惊喜与积分抽奖
- 每日惊喜不消耗积分，只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进付费保底。
- 积分抽奖单抽 170、十连 1600；每 10 次付费抽至少获得一项稀有奖励。
- 补签卡最多持有 2 张；已满仓时付费抽命中补签卡会改为 120 积分补偿。';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT @points_id, @points_title, @points_content,
       '帮助中心', 'public', 'markdown', 98, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @points_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @points_title);

UPDATE knowledge_base
SET content = @points_content,
    category = '帮助中心', status = 'public', type = 'markdown', sort = 98,
    admin_archived = 0, updated_by = NULL
WHERE id = @points_id OR title = @points_title;

SET @support_id = '80b98e73-84c0-4d0a-8dc2-5bd993bc59ae';
SET @support_title = '如何自愿支持轻笺';
SET @support_content = '<h1>如何支持轻笺</h1><p>轻笺的核心记录与整理能力永久免费。赞助完全自愿，用于分担服务器、数据库、存储与带宽等持续成本，也不会影响未赞助用户的正常使用。</p><h2>从哪里进入</h2><p>电脑端可从右上角个人中心进入“支持轻笺”，手机端可从“我的”进入，也可以直接访问 <a href="/support">/support</a>。支持页提供固定档位与自选金额入口；支付、订单和退款由爱发电处理。</p><h2>支持与购买分别记录</h2><p>直接在爱发电主页完成的付款会记录为自愿支持，不会按金额自动匹配 AI 或空间套餐。需要增加 AI 额度或云空间时，请先从资源商店选择对应套餐并按页面提示付款；关联爱发电账号主要用于归并直接支持记录和核对付款身份。</p><h2>支持记录与排行榜</h2><p>登录后从轻笺支持页发起可自动归属；直接在爱发电主页支持后，也可以关联同一爱发电账号归并记录。已确认支持默认以匿名身份参与累计榜，你可以公开昵称头像或退出排行榜。资源商店购买不会计入支持者榜。</p><h2>历史与隐私</h2><p>拆分前已按旧规则发放的 AI 余额继续保留，不会追回。轻笺不保存付款码、支付密码、订单留言或收货地址，归属冲突会等待人工核对。</p><h2>需要 AI 或空间</h2><p>请前往 <a href="/store">资源商店</a> 选择带确切售价和到账数量的套餐，或在“资产与奖励”中使用积分兑换。</p>';

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

SET @store_id = '1d5ce955-326b-4f6c-9e7e-1ea704dca0a2';
SET @store_title = '如何购买 AI 额度与云空间';
SET @store_content = '<h1>资源商店</h1><p><a href="/store">资源商店</a> 是购买永久 AI 额度、永久云空间和组合套餐的统一入口。它与“支持轻笺”分别记录：购买会按付款前确认的内容到账，但不会进入支持者榜。</p><h2>长期与限时套餐</h2><p>长期套餐会分别展示普通购买和第一次购买的确切到账值；每一档套餐的首次优惠独立计算。限时套餐直接展示最终售价、最终到账、有效期和个人限购，不叠加也不消耗长期套餐的首次优惠。</p><h2>下单与账号关联</h2><p>购买前必须登录轻笺，但不要求预先关联爱发电。轻笺会生成一次性结算凭证，把轻笺账号、套餐版本、实付金额和预计到账锁定；付款后再通过爱发电订单 API 核验。实际付款身份也会用于防止同一爱发电账号跨轻笺账号重复领取同一档套餐的首次优惠。</p><h2>请从商店选择套餐</h2><p>直接进入爱发电主页、未携带有效套餐凭证的付款不会根据金额自动匹配套餐。少付、多付、过期、身份冲突或未知凭证都会进入人工复核，不会改发其他权益。</p><h2>到账与退款</h2><p>AI 与空间组合权益在同一事务中发放，重复回调只回放原结果。退款或订单反转进入人工复核，不自动扣成负资产，也不恢复已经使用的首次优惠。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT @store_id, @store_title, @store_content,
       '帮助中心', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @store_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @store_title);

UPDATE knowledge_base
SET content = @store_content,
    category = '帮助中心', status = 'public', type = 'html', sort = 95,
    admin_archived = 0, updated_by = NULL
WHERE id = @store_id OR title = @store_title;

COMMIT;

SELECT id, title, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@ai_quota_id, @points_id, @support_id, @store_id)
   OR title IN (@ai_quota_title, @points_title, @support_title, @store_title)
ORDER BY sort DESC, title;

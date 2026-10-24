-- 资源商店固定永久 AI 与空间帮助同步。MySQL 5.7 兼容、幂等；不改业务 Schema、余额或订单权益。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @store_id = '1d5ce955-326b-4f6c-9e7e-1ea704dca0a2';
SET @store_title = '如何购买 AI 额度与云空间';
SET @store_content = '<!-- data-ln-policy:support-packages-v5 --><h1>资源商店</h1><p><a href="/store">资源商店</a> 是购买永久 AI 额度、永久云空间和组合套餐的统一入口。它与“支持轻笺”分别记录，购买不会进入支持者榜。</p><h2>一次购买，永久有效；优先使用每日免费额度</h2><p>AI 与组合套餐每次购买都按页面标示的固定 AI 额度到账，不再提供首购加赠。每天先使用每日免费额度，再使用购买的永久 AI 余额；购买余额不会按日清零。</p><h2>一次购买，永久扩容</h2><p>云空间套餐每次购买都按页面标示的固定容量永久叠加到当前账号，无需续费，不区分首次购买与再次购买，也没有空间首购加赠。组合套餐的云空间同样固定到账。</p><h2>限时套餐</h2><p>限时套餐直接展示最终售价、最终到账、有效期和个人限购。请核对活动截止时间与可购买次数。</p><h2>下单与账号关联</h2><p>购买前必须登录轻笺，但不要求预先关联爱发电。轻笺会锁定当前账号、套餐版本、金额和权益快照，付款后再通过订单核验确认到账。</p><h2>请从商店选择套餐</h2><p>直接进入爱发电主页、未携带有效套餐凭证的付款不会根据金额自动匹配套餐。少付、多付、过期、身份冲突或未知凭证都会进入人工核对，不会改发其他权益。</p><h2>历史余额、旧订单与退款</h2><p>历史余额和已入账权益保持原样。旧版订单按下单时保存的权益结算，符合原首购规则的订单仍按原规则核验与发放，不会按新版额度削减。重复回调只回放原结果；退款或订单反转进入人工核对，不自动扣成负资产，也不恢复已经使用的历史首购资格。</p>';

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
WHERE id = @store_id OR title = @store_title;

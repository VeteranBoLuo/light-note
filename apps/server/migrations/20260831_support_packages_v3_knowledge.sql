-- 2026-08-31 资源商店 v3 首购范围公开帮助同步。
-- MySQL 5.7 兼容、幂等；只更新 knowledge_base，不改业务 Schema。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @store_id = '1d5ce955-326b-4f6c-9e7e-1ea704dca0a2';
SET @store_title = '如何购买 AI 额度与云空间';
SET @store_content = '<!-- data-ln-policy:support-packages-v3 --><h1>资源商店</h1><p><a href="/store">资源商店</a> 是购买永久 AI 额度、永久云空间和组合套餐的统一入口。它与“支持轻笺”分别记录：订单按付款前确认的价格和基础权益结算，但不会进入支持者榜。</p><h2>长期与限时套餐</h2><p>长期套餐会分别展示基础到账和当前账号的首购候选到账。含 AI 的长期套餐共用一次账号级首购，首次购买 AI 或组合套餐时 AI 额度加赠 20%；使用后，其他 AI 与组合档位都按基础值到账。纯空间套餐的首购容量按各档独立计算。限时套餐直接展示最终售价、最终到账、有效期和个人限购，不叠加也不消耗长期套餐首购。</p><h2>下单与账号关联</h2><p>购买前必须登录轻笺，但不要求预先关联爱发电。轻笺会生成一次性结算凭证，锁定轻笺账号、套餐版本、实付金额、基础权益和首购候选快照；付款后再通过爱发电订单 API 核验。首购加量以实际付款身份的最终核验为准；若该付款身份已经领取过相同范围的首购，订单仍按基础权益到账。实际付款身份也会用于防止同一爱发电账号跨轻笺账号重复领取账号级或分档首购。</p><h2>请从商店选择套餐</h2><p>直接进入爱发电主页、未携带有效套餐凭证的付款不会根据金额自动匹配套餐。少付、多付、过期、身份冲突或未知凭证都会进入人工复核，不会改发其他权益。</p><h2>到账与退款</h2><p>AI 与空间组合权益在同一事务中发放，重复回调只回放原结果。退款或订单反转进入人工复核，不自动扣成负资产，也不恢复已经使用的首购资格。</p>';

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

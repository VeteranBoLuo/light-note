-- 积分经济 C5 永久空间限兑规则公开帮助同步。
-- MySQL 5.7 兼容、幂等；只更新 knowledge_base，不修改业务 Schema。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @points_id = '11a21140-7ecf-117e-8c23-96d5e1f6a052';
SET @points_title = '积分商店与积分抽奖';
SET @points_content = '在“成长中心 → 资产与奖励 → 兑换”可以兑换积分商品，也可以从同一区域进入资源商店购买永久资产。

## AI 永久余额
- AI 轻量加油包：240 积分，永久增加 30 万 tokens。
- AI 加油包：420 积分，永久增加 60 万 tokens。
- 每日等级额度用完后会继续消耗永久余额；永久余额不会跨天过期，两款都没有等级门槛，也可以重复兑换。

## 永久扩容
- 128MB：500 积分；512MB：1600 积分；2GB：5200 积分，兑换后永久叠加在等级容量之上。
- 三档扩容包每个账号各限兑换一次，全部兑换后合计永久增加 2688MB；页面会标明尚可兑换或已经兑换。
- 规则启用前直接用积分兑换过某一档，也会视为该档已经兑换；积分抽奖或运营活动获得的空间不占这三次资格。

## 积分与权益购买
- 积分来自站内使用和任务，不与人民币建立兑换汇率。
- 资源商店提供 AI、空间和组合套餐；购买记录与积分兑换记录分别展示。

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

COMMIT;

SELECT id, title, status, type, sort, CHAR_LENGTH(content) AS content_length
  FROM knowledge_base
 WHERE id = @points_id OR title = @points_title;

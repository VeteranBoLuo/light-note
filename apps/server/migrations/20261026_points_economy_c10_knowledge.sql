-- C10 免费惊喜帮助同步；仅在对应版本获准上线时显式执行并刷新帮助检索缓存。
-- MySQL 5.7 兼容、幂等；不调整余额、历史收据或业务 Schema。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

UPDATE knowledge_base
SET content = REPLACE(
      content,
      '<li>每日惊喜不消耗积分，只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进付费保底。</li>',
      '<li>每日惊喜不消耗积分，只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进付费保底；各档数量与概率以抽奖页当前公示为准。积分与 AI 奖励自动到账，AI 计入永久余额。奖池调整只影响新抽取，已到账奖励和历史记录保留。</li>'
    ), updated_by = NULL
WHERE id = '11a21140-7ecf-117e-8c23-96d5e1f6a052'
  AND INSTR(content, '<li>每日惊喜不消耗积分，只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进付费保底。</li>') > 0;

UPDATE knowledge_base
SET content = REPLACE(
      content,
      '- 奖励属于随机回流，不能算作保证收入；只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进积分抽奖保底。',
      '- 奖励属于随机回流，不能算作保证收入；只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进积分抽奖保底；各档数量与概率以抽奖页当前公示为准。积分与 AI 奖励自动到账，AI 计入永久余额。奖池调整只影响新抽取，已到账奖励和历史记录保留。'
    ), updated_by = NULL
WHERE id = '11a03c80-7ecf-117e-9b34-a4425ee43c95'
  AND INSTR(content, '- 奖励属于随机回流，不能算作保证收入；只发积分或 AI 永久余额，不发永久空间或补签卡，也不推进积分抽奖保底。') > 0;

COMMIT;

SELECT id, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN ('11a21140-7ecf-117e-8c23-96d5e1f6a052', '11a03c80-7ecf-117e-9b34-a4425ee43c95');

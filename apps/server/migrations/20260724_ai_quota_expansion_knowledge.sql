-- 2026-07-24 AI 额度扩容帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。
-- 执行前必须获得 owner 对线上知识库数据写入的单独授权。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- 同步既有积分商店说明，保留可能由运营补充的其他正文内容。
UPDATE knowledge_base
SET content = REPLACE(
  REPLACE(content, '增加 30 万 tokens', '增加 60 万 tokens'),
  '+30 万 tokens',
  '+60 万 tokens'
)
WHERE id = '11a21140-7ecf-117e-8c23-96d5e1f6a052'
   OR title = '积分商店与积分抽奖';

SET @ai_quota_help_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_help_title = 'AI 额度、等级与加油包';
SET @ai_quota_help_content = '<h1>AI 额度、等级与加油包</h1><h2>每日 AI 额度</h2><ul><li><strong>游客：</strong>单设备每日 20 万 tokens，同时会受到可信网络额度保护；达到任一上限后，当天不能继续发起 AI 请求。</li><li><strong>登录用户：</strong>基础额度随成长等级提升。Lv.1 每日 50 万 tokens，等级越高额度越多，Lv.15“文圣”每日 400 万 tokens。</li></ul><p>额度每天 0 点自动重置。一次提问的实际消耗会包含模型输入、回答，以及为完成请求所需的必要上下文或工具处理，因此不同问题的消耗会有差异。</p><h2>AI 加油包</h2><p>AI 加油包售价 150 积分，每件可在使用当天额外增加 60 万 tokens。购买或抽中后会先存入背包；你可以在“我的成长 → 我的背包”中按需使用，未使用的加油包不会因当天结束而失效。</p><h2>查看剩余额度</h2><p>打开轻笺智域即可查看当天已用和剩余额度；也可以直接询问“我还有多少 AI 额度”。使用加油包后，当天上限会立即增加。</p>';

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
WHERE id = @ai_quota_help_id OR title = @ai_quota_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @ai_quota_help_id OR title = @ai_quota_help_title;

-- 2026-07-27 管理员签到排行榜内部知识（MySQL 5.7 兼容、幂等）。
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @checkin_ranking_id = 'ac4f742b-065d-45ea-b6b7-90a4da4e6eb9';
SET @checkin_ranking_title = '管理员 AI：签到与连签排行榜';
SET @checkin_ranking_content = '<h2>管理员签到排行榜</h2><p>Root 管理员可在轻笺智域中询问“目前签到天数排名”“最长连签排名”“当前连签排名”，也可以询问“本月谁签到最多”“最近30天签到排行”。该查询为只读，不会修改成长、积分或签到记录。</p><h3>三种排行口径</h3><ul><li><strong>签到天数</strong>：按有效签到日期去重统计；默认累计全部历史，也可指定本周、本月或最近若干天。</li><li><strong>最长连签</strong>：用户历史上最长的一段连续签到。</li><li><strong>当前连签</strong>：只统计目前仍未断开的连续签到；最近签到早于昨天的历史 streak 不会继续上榜。</li></ul><h3>统计边界</h3><p>数据直接来自有效签到账本，不以积分、经验、资源新增或操作日志代替。补签卡补上的日期按成长系统现有规则计入签到与连签，榜单会给出补签天数摘要供审计。默认排除 root/test 内部账号、已删除账号和指标为 0 的账号；可在明确需要时包含内部账号或限制指定注册时间范围。</p><h3>返回信息</h3><p>每位上榜用户会显示名次（同分并列）、本次排序值、累计签到天数、历史最长连签、当前连签、最近签到日与今日是否已签到。常规榜单回答不主动展示邮箱或完整签到日历。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @checkin_ranking_id, @checkin_ranking_title, @checkin_ranking_content,
  '内部知识', 'internal', 'html', 97, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @checkin_ranking_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @checkin_ranking_id);

UPDATE knowledge_base
SET content = @checkin_ranking_content,
    category = '内部知识',
    status = 'internal',
    type = 'html',
    sort = 97,
    updated_by = NULL
WHERE id = @checkin_ranking_id OR title = @checkin_ranking_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @checkin_ranking_id OR title = @checkin_ranking_title;

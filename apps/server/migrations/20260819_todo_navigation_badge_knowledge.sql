-- 2026-08-19 待办导航注意力角标帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @todo_navigation_badge_help_id = 'e1a62c50-6aee-4cac-8087-3e40be486e1a';
SET @todo_navigation_badge_help_title = '顶部待办角标的数字和红色、橙色分别表示什么';
SET @todo_navigation_badge_help_content = '<h1>待办导航角标表示需要现在关注的任务</h1><p>电脑端顶部导航和移动端底部导航中，“待办”右侧的数字使用同一套注意力口径：只统计尚未完成并且已经逾期或今天到期的待办。它不是全部未完成待办数，也不表示优先级。</p><h2>数字如何计算</h2><p>角标数字等于“已逾期的未完成待办数 + 今天到期的未完成待办数”。明天以后到期、没有截止时间的普通待办或已经完成的待办不计入角标；固定周期待办则按本次计划发生日期判断今天到期或逾期，即使这一项没有单独设置截止时间，也会在应处理的日期计入。合计为 0 时不显示角标，超过 99 时显示为“99+”。</p><h2>红色和橙色分别表示什么</h2><ul><li><b>橙色：</b>当前只有今天到期的待办，没有已经逾期的待办；</li><li><b>红色：</b>当前至少有一项待办已经逾期。此时数字仍是“逾期 + 今天到期”的合计，例如逾期 1 项、今天到期 5 项会显示红色“6”。</li></ul><h2>依据截止时间或周期计划，不是提醒时间</h2><p>普通待办根据截止时间判断，固定周期待办根据本次计划发生日期判断。提醒时间只是通知时刻；即使某次提醒时间已经过去，只要待办尚未到截止日期或计划日期，就不会因此变成红色逾期待办。完成待办后，它会从角标统计中移除，尚未发送的提醒也会取消。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @todo_navigation_badge_help_id, @todo_navigation_badge_help_title, @todo_navigation_badge_help_content,
  '帮助中心', 'public', 'html', 921, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_navigation_badge_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_navigation_badge_help_title);

-- 固定 ID 优先；若旧环境已由标题创建过同一条知识，则只更新那一条，避免 OR 条件误改两行。
SET @todo_navigation_badge_help_target_id = COALESCE(
  (SELECT id FROM knowledge_base WHERE id = @todo_navigation_badge_help_id LIMIT 1),
  (SELECT id FROM knowledge_base WHERE title = @todo_navigation_badge_help_title ORDER BY id ASC LIMIT 1)
);

UPDATE knowledge_base
SET title = @todo_navigation_badge_help_title,
    content = @todo_navigation_badge_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 921,
    updated_by = NULL
WHERE id = @todo_navigation_badge_help_target_id;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @todo_navigation_badge_help_target_id;

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

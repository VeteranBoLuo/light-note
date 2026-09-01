-- 2026-09-01 每日回顾公开帮助同步。
-- MySQL 5.7 兼容、幂等；只更新 knowledge_base，不改业务 Schema。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @daily_review_help_id = 'a55d8723-2270-4adf-aa80-a12cdd67c105';
SET @daily_review_help_title = '移动端「今日」页面是什么';
SET @daily_review_help_content = '# 移动端「今日」\n\n「今日」是移动端底部导航的第一个入口，也是每天打开轻笺后处理事情的第一站。\n\n## 它展示什么\n\n- 日期与问候，以及今天应优先处理多少件事\n- 待处理总览：未完成待办 / 待整理 / 未读通知，统计口径与桌面工作台一致，点击可进入对应列表或通知中心\n- 快速记录：记一句、待办、保存链接、上传\n- 今日待办与待整理明细，可以直接完成、延期到明天、编辑或标记整理完成；逾期待办会在这里明确标出\n- 继续处理：最近编辑的笔记和最近上传的文件，最多 2 条\n- 每日回顾：按账号时区每天固定最多 3 条旧书签、笔记或文件，可能来自往年今日、最近在整理的标签或沉淀已久的内容。打开内容就算回顾了这一条；也可以 7 天后再看、不再推荐这条，或者只把今天的回顾收起\n\n每日回顾使用账号日历与时区决定当天清单；同一天刷新、重新登录或换设备，条目与进度保持一致。打开后当前条会退出待回顾状态，全部处理完会显示今日完成；当日所有仍可用条目都通过打开内容或进入原因标签真实回顾后，会自动结算一次 5 EXP（受每日经验上限影响）。“7 天后再看”“不再推荐这条”和“今天先收起”都不计入奖励；前两项只改变对应内容的后续推荐，“今天先收起”不会永久隐藏内容。它在今日摘要落屏后单独加载，即使暂时失败也不会挡住待办和快速记录。Android App 在列表顶部支持下拉刷新，松开后会同时刷新今日摘要、行动项、每日回顾和成长任务。普通手机浏览器继续使用页面内刷新入口，不接管浏览器自身的页面回弹。\n\n## 它不展示什么\n\n资源总量、增长趋势、文件类型分布、常用标签排行和最近更新不在移动端今日页，它们仍然保留在**桌面端工作台**。移动端今日只回答「我今天先做什么、有哪些资料还没整理」。\n\n## 与桌面工作台的关系\n\n两者是同一个地址 /workbenches：桌面端打开是完整工作台，移动端打开是今日。';
SET @daily_review_help_sort = (SELECT COALESCE(MAX(sort), -1) + 1 FROM knowledge_base);

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT @daily_review_help_id, @daily_review_help_title, @daily_review_help_content,
       '帮助中心', 'public', 'markdown', @daily_review_help_sort, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @daily_review_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @daily_review_help_title);

UPDATE knowledge_base
SET title = @daily_review_help_title,
    content = @daily_review_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'markdown',
    admin_archived = 0,
    updated_by = NULL
WHERE id = @daily_review_help_id OR title = @daily_review_help_title;

COMMIT;

SELECT id, title, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @daily_review_help_id OR title = @daily_review_help_title;

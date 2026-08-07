-- 2026-08-07 待办“默认单任务 × 高级独立任务”帮助知识（MySQL 5.7、幂等）
-- 仅同步 knowledge_base 内容，不修改结构；执行后需重启后端以刷新知识检索缓存。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @todo_single_schedule_id = '8ac19ce7-5b2c-4d0e-8d60-d81f636d89bb';
SET @todo_single_schedule_title = '待办提醒与独立任务：什么时候只创建一条，什么时候创建多条';
SET @todo_single_schedule_content = '<h1>默认只创建一条待办</h1><p>普通创建、快速添加和 AI 创建默认都是单条待办。开始时间和截止时间描述这件事何时开始、最晚何时完成；提醒只负责通知，不会因为“每天提醒”而每天复制一条任务。</p><h2>一条待办也能重复提醒</h2><p>提醒支持不提醒、提醒一次和重复提醒。提醒一次可选截止时、开始时、截止前或指定时间；重复提醒可按间隔、按周或按月设置，并明确开始时间和停止条件。比如“每天 09:00 提醒我学习，直到完成”始终只有一条待办，只会产生多个提醒时刻。</p><h2>什么时候开启高级独立任务</h2><p>只有每次日程都要分别勾选、分别保留完成记录时，才开启“每次计划都需要单独完成”。例如 30 天课程每天都要记录一次完成，应创建 30 条独立待办；如果只是同一件事需要每天催一次，不应开启。</p><h2>安全停止规则</h2><p>有截止时间时，重复提醒默认在任务完成或到达截止时间后停止；无截止时间时应选择完成后停止、指定结束日期、最多次数或手动关闭。邮件重复提醒必须设置结束日期或最多次数。单条任务最多安排 500 个未来投递，长期站内提醒按未来 60 天滚动补齐。</p><h2>快速添加</h2><p>快速添加可选择无日期、今天、明天或本周，以及低、普通或高优先级；提醒预设包括不提醒、截止前 1 小时和每天 09:00。没有截止时间时不能选择“截止前 1 小时”。点击“完善详情”会保留草稿，再进入完整编辑器设置复杂提醒或高级独立任务。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @todo_single_schedule_id, @todo_single_schedule_title, @todo_single_schedule_content,
  '帮助中心', 'public', 'html', 919, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_single_schedule_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_single_schedule_title);

UPDATE knowledge_base
SET content = @todo_single_schedule_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 919,
    updated_by = NULL
WHERE id = @todo_single_schedule_id OR title = @todo_single_schedule_title;

-- 同步旧版“任务计划 × 每项提醒”说明，避免把所有重复提醒都解释为多个实例。
UPDATE knowledge_base
SET content = '<h1>任务与提醒是两件事</h1><p><b>默认单任务</b>只创建一条待办；它可以不提醒、提醒一次，也可以按间隔、按周或按月重复提醒。任务完成后，其未发送提醒会取消。</p><p><b>高级独立任务</b>用于每次日程都要分别完成的场景，会按每天、每周、每月或完成后再次安排生成多条待办。某一条未完成不会阻止固定日程的下一条出现。</p><h2>如何选择</h2><ul><li>“每天 09:00 提醒我交报告，直到完成”——单任务重复提醒。</li><li>“连续 30 天学习，每天都要单独打卡”——高级独立任务。</li></ul><p>开始时间、截止时间、时区、停止条件和提醒数量以保存前的服务端预览为准。旧版重复任务不会被静默转换，可继续在兼容编辑器中维护。</p>',
    updated_by = NULL
WHERE id = 'b5ce7892-e35a-4f25-ad6f-1e1bfafc4a65'
   OR title = '任务计划与每项提醒：重复任务、催办、开始时间和截止时间怎么设置';

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@todo_single_schedule_id, 'b5ce7892-e35a-4f25-ad6f-1e1bfafc4a65');

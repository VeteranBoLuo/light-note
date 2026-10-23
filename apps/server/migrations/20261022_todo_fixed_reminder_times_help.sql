-- 定时提醒支持多个固定时间。仅更新公开帮助内容；MySQL 5.7 兼容、幂等。
-- 随功能发布受授权执行，不接入应用启动；执行后刷新帮助检索缓存。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
UPDATE knowledge_base
SET content = REPLACE(content,
  '提醒支持不提醒、提醒一次和重复提醒。提醒一次可选截止时、开始时、截止前或指定时间；',
  '提醒支持不提醒、定时提醒和按周期重复。定时提醒可选截止时、开始时、截止前或固定时间；')
WHERE id = '8ac19ce7-5b2c-4d0e-8d60-d81f636d89bb'
  AND category = '帮助中心' AND status = 'public' AND type = 'html';
UPDATE knowledge_base
SET content = CONCAT(content, '<h2>添加多个固定提醒时间</h2><p>在提醒计划中选择“定时提醒”，把提醒时机设为“固定时间”。点击日期时间旁的“＋”可添加更多日期时间，删除按钮可移除多余时间。所有时间都提醒同一条待办，不会生成多条任务。每个新增时间都需要填写完整；保存时按分钟归一、排序并合并重复时间，过去的时间不会补发。</p><p>保存前预览会显示提醒次数和下一次提醒时间。站内与邮箱渠道分别产生投递，仍遵循单条待办最多 500 个提醒投递的限制。任务完成、删除或关闭提醒后停止后续提醒。</p>'),
    help_section = COALESCE(NULLIF(help_section, ''), '待办与提醒'), updated_by = NULL
WHERE id = '8ac19ce7-5b2c-4d0e-8d60-d81f636d89bb'
  AND category = '帮助中心' AND status = 'public' AND type = 'html'
  AND content NOT LIKE '%<h2>添加多个固定提醒时间</h2>%';
COMMIT;

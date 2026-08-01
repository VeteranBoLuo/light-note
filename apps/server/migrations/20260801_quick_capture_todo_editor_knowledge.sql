-- 2026-08-01 快速添加与完整待办编辑器帮助说明（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @action_center_help_id = '7bcbe44c-e762-4c87-97b4-d306e3306622';
SET @action_center_help_title = '快速添加、待整理与待办怎么使用';
SET @action_center_help_content = '<h1>快速添加、待整理与待办怎么使用</h1><h2>快速添加资源</h2><p>电脑端的“快速添加”支持网址、文字、文件和待办。添加文件时可以选择文件、拖入文件，也可以直接按 Ctrl/Command + V 粘贴剪贴板中的图片或文件。网址、文字和文件会先进入待整理，你可以稍后补充标签和位置；移动端快速添加只收集书签、笔记和文件，待办从底部“待办”入口创建。</p><h2>快速创建待办</h2><p>切换到“待办”后，只需要填写标题，也可以顺手选择无日期、今天或明天，以及低、普通或高优先级。点击“立即创建”会直接保存到待办列表；点击“完善详情”会保留当前草稿并打开完整编辑器。</p><h2>完整编辑待办</h2><p>完整编辑器在电脑端从右侧打开，在移动端从底部打开。你可以补充说明、关联书签/笔记/文件、简易清单、截止时间、重复规则和提醒计划。把提醒从“不提醒”切换为单次或周期提醒后，表单会自动带你看到需要补充的提醒字段。</p><h2>待整理与待办的边界</h2><p>待整理只管理需要归类的书签、笔记和文件；待办是独立的行动对象，通过列表、议程和日历推进。两者不会混用标签筛选和批量操作，完成或删除待办也不会修改关联资料。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @action_center_help_id, @action_center_help_title, @action_center_help_content,
  '帮助中心', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @action_center_help_id)
  AND NOT EXISTS (
    SELECT 1
    FROM knowledge_base
    WHERE title IN (
      @action_center_help_title,
      '待处理：待整理与待办怎么使用',
      '行动中心：待整理与待办怎么使用',
      '快速收集与待整理箱怎么使用'
    )
  );

SET @quick_capture_title_conflict = (
  SELECT COUNT(*)
  FROM knowledge_base
  WHERE title = @action_center_help_title AND id <> @action_center_help_id
);

UPDATE knowledge_base
SET title = @action_center_help_title
WHERE id = @action_center_help_id AND @quick_capture_title_conflict = 0;

UPDATE knowledge_base
SET content = @action_center_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 95,
    updated_by = NULL
WHERE id = @action_center_help_id
   OR title IN (
     @action_center_help_title,
     '待处理：待整理与待办怎么使用',
     '行动中心：待整理与待办怎么使用',
     '快速收集与待整理箱怎么使用'
   );

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @action_center_help_id OR title = @action_center_help_title;

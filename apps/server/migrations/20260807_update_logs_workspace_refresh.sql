-- 2026-08-07 工作区焕新：更新日志同步（MySQL 5.7、幂等）
-- 仅同步 update_logs 业务内容，不修改表结构；不随部署脚本自动执行。
-- 依赖：20260728_update_logs_markdown.sql 创建的 update_logs。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

INSERT INTO update_logs
  (id, title, publish_date, summary, highlights, tags, content_markdown, image_keys, status, sort, created_by)
VALUES
  (
    'release-20260807-workspace-refresh',
    '轻笺工作区焕新：笔记目录树、待办 2.0 与移动端升级',
    '2026-08-07',
    '笔记目录树、待办 2.0 和移动端核心页面完成升级，资源标签胶囊也统一为更清晰的语义配色。',
    JSON_ARRAY(
      '笔记新增目录树与子页面能力，桌面端侧栏和移动端抽屉都能快速浏览层级、切换页面与整理位置。',
      '待办 2.0 默认创建一条任务并独立设置提醒；需要逐次完成记录时，可切换到高级独立任务计划。',
      '今日、资料、待办、收集箱、笔记和 AI 等移动端核心页面完成布局与交互重构。',
      '用户标签统一使用粉色语义胶囊，置顶、状态与元信息分别使用紫色、琥珀色和中性色，跨页面识别更一致。',
      'AI 回答支持切换页面后继续生成，移动端底部入口会提示生成中、完成或异常状态。'
    ),
    JSON_ARRAY('笔记', '待办', '移动端', '标签', 'AI'),
    '## 笔记目录树与子页面\n\n笔记现在拥有清晰的页面层级。你可以在桌面端目录侧栏或移动端目录抽屉中浏览父子页面、展开层级、切换当前页面，并通过拖拽或移动操作整理笔记位置。笔记列表也新增只读预览，查看内容后再决定是否进入编辑。\n\n## 待办 2.0\n\n待办的“任务”和“提醒”现在分得更清楚：\n\n- 默认模式只创建一条待办，可选择不提醒、提醒一次或重复提醒。\n- 只有每次计划都需要分别完成和留存记录时，才开启高级独立任务。\n- 快速添加支持日期、优先级和提醒预设；复杂计划可进入完整编辑器继续完善。\n- 保存前会展示任务与提醒预览，减少误创建和重复任务。\n\n## 移动端核心页面重构\n\n今日、资料、待办、收集箱、笔记和 AI 等核心页面统一了移动端的信息层级、底部导航与操作抽屉。常用入口更集中，单手操作更顺畅。AI 回答在切换到其他页面后仍会继续生成，底部 AI 入口会同步显示当前状态。\n\n## 标签胶囊语义配色统一\n\n书签、笔记、文件、搜索结果和标签详情中的胶囊样式现已统一：\n\n- 用户标签使用粉色，突出“内容分类”的共同语义。\n- 置顶使用紫色，并配合固定图标强化识别。\n- 待处理等状态使用琥珀色，普通元信息使用中性色。\n\n深色和浅色主题下均保持一致的层级与可读性。',
    JSON_ARRAY(),
    'published',
    0,
    NULL
  )
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  publish_date = VALUES(publish_date),
  summary = VALUES(summary),
  highlights = VALUES(highlights),
  tags = VALUES(tags),
  content_markdown = VALUES(content_markdown),
  image_keys = VALUES(image_keys),
  status = VALUES(status),
  sort = VALUES(sort);

COMMIT;

SELECT id, title, publish_date, status, JSON_LENGTH(highlights) AS highlight_count
FROM update_logs
WHERE id = 'release-20260807-workspace-refresh';

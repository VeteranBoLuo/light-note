-- 2026-07-28 待办导出系统日历：帮助中心、AI 知识库与更新日志同步
-- MySQL 5.7 兼容、幂等；只同步业务内容，不修改表结构，不随部署脚本自动执行。
-- 依赖：knowledge_base，以及 20260728_update_logs_markdown.sql 创建的 update_logs。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @todo_calendar_help_id = 'ae78f21d-cdcc-48a8-b621-38a8a028178b';
SET @todo_calendar_help_title = '如何把轻笺待办加入系统日历';
SET @todo_calendar_help_content = '<h1>把待办加入系统日历</h1><p>轻笺可以把有截止时间的待办导出为标准日历文件，再由手机或电脑的系统日历导入。导出过程在当前设备完成，不会把日历内容上传到第三方服务。</p><h2>操作步骤</h2><ol><li>进入“待处理”；手机端可直接打开底部“待办”。</li><li>找到有截止时间的待办，点击“加入日历”。</li><li>选择日历提醒时间，然后点击“导出日历文件”。</li><li>手机端优先打开系统分享面板，请选择日历应用并确认添加；电脑端会下载 <code>.ics</code> 文件，请从下载列表打开并选择系统日历。</li></ol><h2>没有截止时间怎么办</h2><p>日历事件必须有明确时间。若待办尚未设置截止时间，轻笺会提示先进入编辑页补充，之后再导出。</p><h2>提醒与同步边界</h2><p>可选择不提醒、准时、提前 5 分钟、15 分钟、30 分钟、1 小时或 1 天。导出的是一次性日历文件，不是持续同步：以后在轻笺修改截止时间、标题、说明或完成状态，不会自动改动已经导入的系统日历事件；需要时请重新导出并在日历应用中确认更新。</p><h2>分享或下载后没有看到事件</h2><p>轻笺只负责把标准日历文件交给系统。手机分享后仍需在日历应用中完成添加；下载后请打开系统下载列表中的 <code>.ics</code> 文件。不同浏览器和系统显示的日历应用、确认按钮及下载入口可能不同。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @todo_calendar_help_id, @todo_calendar_help_title, @todo_calendar_help_content,
  '帮助中心', 'public', 'html', 106, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_calendar_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_calendar_help_id);

UPDATE knowledge_base
SET title = @todo_calendar_help_title,
    content = @todo_calendar_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 106,
    updated_by = NULL
WHERE id = @todo_calendar_help_id OR title = @todo_calendar_help_title;

INSERT INTO update_logs
  (id, title, publish_date, summary, highlights, tags, content_markdown, image_keys, status, sort, created_by)
VALUES
  (
    'release-20260728-todo-calendar',
    '待办现可加入系统日历',
    '2026-07-28',
    '把有截止时间的轻笺待办导入手机或电脑日历，并按需要设置提醒。',
    JSON_ARRAY(
      '有截止时间的待办新增“加入日历”，可选择准时或提前 5 分钟、15 分钟、30 分钟、1 小时、1 天提醒，也可不额外提醒。',
      '手机端优先调用系统分享面板，电脑端直接下载标准 .ics 文件；导入后可从日历事件返回轻笺查看对应待办。',
      '日历文件在当前设备生成。导出是一次性的，之后在轻笺修改待办不会自动同步到已经导入的日历事件。'
    ),
    JSON_ARRAY('待办', '日历', '效率'),
    '## 待办加入系统日历\n\n有截止时间的待办现在可以导出到手机或电脑的系统日历。打开“待处理”（手机端为底部“待办”），点击待办卡片上的“加入日历”，选择提醒时间后导出即可。\n\n### 支持的提醒\n\n- 不提醒\n- 准时提醒\n- 提前 5 分钟、15 分钟或 30 分钟\n- 提前 1 小时或 1 天\n\n手机端会优先打开系统分享面板，请选择日历应用并确认添加；电脑端会下载 `.ics` 文件，可从下载列表打开并导入系统日历。\n\n> 这是一次性导出，不是持续同步。之后在轻笺修改待办时，已经导入的日历事件不会自动变化；需要时请重新导出。',
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

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @todo_calendar_help_id OR title = @todo_calendar_help_title;

SELECT id, title, publish_date, status, JSON_LENGTH(highlights) AS highlight_count
FROM update_logs
WHERE id = 'release-20260728-todo-calendar';

-- 2026-07-23 Agent 工具能力发布说明与帮助知识（MySQL 5.7 兼容、幂等）
-- 仅更新现有更新日志配置和 knowledge_base 业务内容，不修改表结构。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @changelog_name = '更新日志';
SET @release_label = '🤖 轻笺智域 Agent 能力增强 · 待办查询与安全执行上线';
SET @release_time = '2026-07-23';

SET @release_entry = JSON_OBJECT(
  'label', @release_label,
  'time', @release_time,
  'list', JSON_ARRAY(
    '轻笺智域新增待办与待整理查询能力：可以用自然语言查看待处理、已完成或全部待办，也能查询待整理中的书签、笔记和文件。',
    'AI 现在可以把一条明确的待办标记为完成或重新打开；目标不明确时会先让你选择，执行前始终展示影响范围并等待确认。',
    '写操作安全闭环进一步加强：未确认、已取消、执行失败或缺少服务端成功回执时，AI 不会再把操作描述成已经完成；重新执行也会重新校验目标并生成新的确认。',
    '工具选择和意图识别同步升级，能够区分“我有哪些已完成待办”等查询与真正的数据修改请求，并对暂未支持或禁止的操作明确说明没有执行。'
  )
);

INSERT INTO config_json (name, json_content, del_flag)
VALUES (@changelog_name, JSON_ARRAY(JSON_EXTRACT(@release_entry, '$')), 0)
ON DUPLICATE KEY UPDATE
  json_content = IF(
    JSON_VALID(json_content) = 1
      AND JSON_SEARCH(json_content, 'one', @release_label) IS NULL,
    JSON_ARRAY_APPEND(json_content, '$', JSON_EXTRACT(@release_entry, '$')),
    json_content
  ),
  del_flag = 0;

SET @help_id = 'd2bda758-2f03-498d-9906-ca3f2ebecd51';
SET @help_title = 'AI 助手如何查询待办、待整理并安全修改待办状态';
SET @help_content = '<h1>使用 AI 查询和处理待办</h1><p>轻笺智域可以读取当前账号的待办与待整理摘要，也可以在你确认后修改一条明确待办的状态。</p><h2>可以查询什么</h2><ul><li>待处理、已完成或全部待办；</li><li>按关键词查找待办，并查看优先级、截止时间、清单进度和提醒渠道摘要；</li><li>查询待整理中的书签、笔记和文件，并从回答来源打开对应资源。</li></ul><p>例如可以询问“我目前已完成的待办有哪些？”“列出本周到期的待办”或“待整理里有哪些笔记？”。查询不会修改任何数据，也不会弹出写操作确认。</p><h2>修改一条待办状态</h2><p>你可以要求“把待办‘整理发票’标记为完成”或“重新打开待办‘整理发票’”。没有匹配项时 AI 会如实提示；只有一个匹配项时会展示确认卡；存在少量重名结果时会先让你选择具体目标。</p><p>确认卡会展示目标、当前状态、目标状态、截止时间、优先级和提醒影响。完成待办会取消尚未触发的提醒；重新打开不会自动恢复已取消的提醒。</p><h2>执行安全规则</h2><ul><li>确认卡出现不代表已经执行，只有点击确认并收到服务端成功回执后才算完成；</li><li>取消、过期、失败或结果无法核验时，AI 不会宣称操作成功；</li><li>“重新执行”会重新检查权限、归属、目标状态和版本，并生成新的确认，不会复活旧令牌；</li><li>暂未支持的删除、批量修改等操作会明确说明没有执行，不会用普通回答伪装成成功。</li></ul><h2>当前范围</h2><p>当前只支持修改当前账号的一条待办状态，不支持批量完成、修改清单子项、编辑提醒或代其他账号写入。游客和管理员代管上下文不能通过 AI 修改待办。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @help_id, @help_title, @help_content,
  '帮助中心', 'public', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @help_id);

UPDATE knowledge_base
SET content = @help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    updated_by = NULL
WHERE id = @help_id OR title = @help_title;

COMMIT;

SELECT
  name,
  JSON_VALID(json_content) AS json_valid,
  JSON_LENGTH(json_content) AS entry_count,
  updated_time
FROM config_json
WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND del_flag = 0;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @help_id OR title = @help_title;

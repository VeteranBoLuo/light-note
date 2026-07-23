-- 合并 2026-07-23 的两条更新日志（MySQL 5.7 兼容、可重复执行）。
-- 只移除指定标题的旧条目，再追加合并后的单条记录；其他历史日志保持不变。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @changelog_name = '更新日志';
SET @old_release_label = '✨ 「轻笺智域」AI 工作区上线 · 智能创作、文件解析、共建反馈与知识足迹全面升级';
SET @old_agent_label = '🤖 轻笺智域 Agent 能力增强 · 待办查询与安全执行上线';
SET @merged_release_label = '✨ 轻笺智域全面升级 · AI 工作区、Agent 执行与知识足迹上线';

SET @merged_release_entry = JSON_OBJECT(
  'label', @merged_release_label,
  'time', '2026-07-23',
  'list', JSON_ARRAY(
    '「轻笺智域」升级为完整的 AI 对话工作区：支持云端会话历史、自动标题、搜索、重命名与删除，桌面端可在抽屉和全屏间切换；跨设备打开时会同步最新会话，也能在云端记录被清除后选择继续新会话或恢复本机历史。',
    'AI 对话支持更丰富的个人上下文：可通过「@添加资源」选择书签、笔记和文件，也可直接上传资料；回答会展示引用来源，并支持文档解析、本地 OCR、内容检索与临时附件保存。',
    'Agent 能力新增待办与待整理查询：可以用自然语言查看待处理、已完成或全部待办，以及待整理中的书签、笔记和文件；也可在确认后将一条明确待办标记为完成或重新打开。',
    '数据操作采用更严格的安全闭环：目标不明确时先选择，执行前展示影响范围；未确认、已取消、执行失败或缺少服务端成功回执时，AI 不会把操作描述成已经完成，并会明确区分查询与修改请求。',
    '笔记创作体验升级：新增内置与个人模板、置顶和批量操作；笔记内 AI 建议支持结果对比、追问迭代与撤回应用，正文还可用「@」提及自己的资源并形成可跳转引用。',
    '新增「知识足迹」热力图和「共建轻笺」：可按自然年回顾书签、笔记、文件与签到活动，也可提交建议、参与投票并查看产品进度。',
    '书签识别、网页快照、图片 OCR、登录设备管理和验证码防护等稳定性持续加强；出于隐私与可控性考虑，AI 长期记忆目前仍保持关闭。'
  )
);

SET @old_release_path = (
  SELECT JSON_UNQUOTE(JSON_SEARCH(json_content, 'one', @old_release_label, NULL, '$[*].label'))
  FROM config_json
  WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
    AND del_flag = 0
  LIMIT 1
);
SET @old_release_path = REPLACE(@old_release_path, '.label', '');
UPDATE config_json
SET json_content = CASE
  WHEN @old_release_path IS NULL THEN json_content
  ELSE JSON_REMOVE(json_content, @old_release_path)
END
WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND del_flag = 0
  AND JSON_VALID(json_content) = 1;

SET @old_agent_path = (
  SELECT JSON_UNQUOTE(JSON_SEARCH(json_content, 'one', @old_agent_label, NULL, '$[*].label'))
  FROM config_json
  WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
    AND del_flag = 0
  LIMIT 1
);
SET @old_agent_path = REPLACE(@old_agent_path, '.label', '');
UPDATE config_json
SET json_content = CASE
  WHEN @old_agent_path IS NULL THEN json_content
  ELSE JSON_REMOVE(json_content, @old_agent_path)
END
WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND del_flag = 0
  AND JSON_VALID(json_content) = 1;

-- 重复执行时先移除旧的合并条目，再用当前文案重新追加。
SET @merged_release_path = (
  SELECT JSON_UNQUOTE(JSON_SEARCH(json_content, 'one', @merged_release_label, NULL, '$[*].label'))
  FROM config_json
  WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
    AND del_flag = 0
  LIMIT 1
);
SET @merged_release_path = REPLACE(@merged_release_path, '.label', '');
UPDATE config_json
SET json_content = CASE
  WHEN @merged_release_path IS NULL THEN json_content
  ELSE JSON_REMOVE(json_content, @merged_release_path)
END
WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND del_flag = 0
  AND JSON_VALID(json_content) = 1;

UPDATE config_json
SET json_content = JSON_ARRAY_APPEND(json_content, '$', JSON_EXTRACT(@merged_release_entry, '$')),
    del_flag = 0
WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND JSON_VALID(json_content) = 1;

COMMIT;

SELECT
  name,
  JSON_VALID(json_content) AS json_valid,
  JSON_LENGTH(json_content) AS entry_count,
  updated_time
FROM config_json
WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND del_flag = 0;

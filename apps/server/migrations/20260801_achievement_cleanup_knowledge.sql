-- 成就体系 PR1：同步“首次体验不再作为成就”的产品说明。
-- 仅更新 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

UPDATE knowledge_base
SET content = CONCAT(
      content,
      '\n\n## 成就与成长任务边界\n- 成就徽章用于长期积累，当前包含连续签到、累计资源、完成待办、整理资源、等级和使用年限等目标。\n- 首次创建书签、笔记、文件等激活行为不再单独展示为成就徽章，避免与后续一次性成长任务重复激励。\n- 历史已经发放的成就积分不会被回收；调整只影响当前成就列表和后续领取。'
    ),
    updated_by = NULL
WHERE title = '我的成长与积分系统'
  AND content NOT LIKE '%成就与成长任务边界%';

COMMIT;

SELECT id, title, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE title = '我的成长与积分系统';

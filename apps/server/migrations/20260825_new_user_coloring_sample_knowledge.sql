-- 2026-08-25 新账号手绘示例改为“上色”（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务文案，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @new_user_samples_id = '8f1795d6-2991-40f1-835e-fae25eb1c3d9';
SET @new_user_samples_title = '为什么新账号里已经有书签、笔记、标签和文件';

UPDATE knowledge_base
SET content = REPLACE(
      content,
      '其中手绘样例标题为“手绘笔记示例”',
      '其中手绘样例标题为“上色”'
    ),
    updated_by = NULL
WHERE id = @new_user_samples_id OR title = @new_user_samples_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @new_user_samples_id OR title = @new_user_samples_title;

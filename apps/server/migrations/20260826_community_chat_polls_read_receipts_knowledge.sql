-- 2026-08-26 聊天室投票与逐消息已读帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @community_chat_poll_receipt_help_id = 'fd9b4629-a745-4906-8b54-5cea6cb0cd48';
SET @community_chat_poll_receipt_help_title = '聊天室投票和发言已读如何使用';
SET @community_chat_poll_receipt_help_content = '<h1>Root 发起，成员参与</h1><p>聊天室的“发起投票”和“统计这条发言的已读人数”只对 Root 开放。普通登录用户可以参与尚未结束的单选投票，并在截止前修改选择；游客可以阅读投票，但不能投票。</p><h2>发起和结束投票</h2><p>Root 创建投票时需要填写问题、2～10 个不重复的选项和截止时间。截止时间最早为 5 分钟后，最长为 30 天。Root 可以在截止前提前结束投票；结束后不能再投票或改票。</p><h2>结果什么时候可见</h2><p>Root 在投票期间就能查看聚合票数，普通用户在投票结束后查看结果。聊天室只展示每个选项的票数、比例和总参与人数，不公开谁选择了哪个选项。</p><h2>“已读”代表什么</h2><p>逐消息已读开关开启时，新发送的 Root 消息和投票会自动统计。登录用户在前台让消息正文连续可见一小段时间后，系统才把该账号计为一人；重复查看不会重复增加。作者本人和游客不计入，也不会展示已读用户名单。“已读”只表示消息气泡曾达到可见条件，不代表用户理解、同意或完成了其中的事项。</p><p>这两项能力需要管理员显式开启功能开关；关闭时既有历史和聚合数不会被删除，但暂时不能新建投票、投票或记录新的逐消息已读。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @community_chat_poll_receipt_help_id, @community_chat_poll_receipt_help_title, @community_chat_poll_receipt_help_content,
  '帮助中心', 'public', 'html', 923, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @community_chat_poll_receipt_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @community_chat_poll_receipt_help_title);

UPDATE knowledge_base
SET title = @community_chat_poll_receipt_help_title,
    content = @community_chat_poll_receipt_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 923,
    updated_by = NULL
WHERE id = @community_chat_poll_receipt_help_id OR title = @community_chat_poll_receipt_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @community_chat_poll_receipt_help_id;

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。

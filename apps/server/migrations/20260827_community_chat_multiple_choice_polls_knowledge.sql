-- 2026-08-27 聊天室单选/多选投票帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @community_chat_poll_receipt_help_id = 'fd9b4629-a745-4906-8b54-5cea6cb0cd48';
SET @community_chat_poll_receipt_help_title = '聊天室投票和发言已读如何使用';
SET @community_chat_poll_receipt_help_content = '<h1>Root 发起，成员参与</h1><p>聊天室的“发起投票”和“统计这条发言的已读人数”只对 Root 开放。普通登录用户可以参与尚未结束的投票，并在截止前修改选择；游客可以阅读投票，但不能投票。</p><h2>单选与多选</h2><p>Root 发布时可以选择单选或多选。单选投票中，每位成员只能选择 1 项，点击选项后立即提交；多选投票还要设置每人最多可选项数，成员选择 1 项至该上限后一次提交完整选择。更新多选时会以最新提交的完整选择为准，不会把多次提交累加成额外票数。</p><h2>发起和结束投票</h2><p>Root 创建投票时需要填写问题、2～10 个不重复的选项和截止时间。截止时间最早为 5 分钟后，最长为 30 天。Root 可以在截止前提前结束投票；结束后不能再投票或改票。</p><h2>结果什么时候可见</h2><p>Root 在投票期间就能查看聚合票数，普通用户在投票结束后查看结果。聊天室只展示每个选项的票数、比例和去重后的总参与人数，不公开谁选择了哪个选项。多选投票的选项比例按参与人数计算，因此各选项比例相加可能超过 100%。</p><h2>“已读”代表什么</h2><p>逐消息已读开关开启时，新发送的 Root 消息和投票会自动统计。登录用户只有在页面位于前台、浏览器获得焦点，并让消息气泡连续出现在可视区域至少 0.8 秒后，系统才把该账号计为一人；只进入聊天室、只露出头像昵称、快速划过或切到后台都不计入。重复查看不会重复增加，作者本人和游客也不计入。</p><p>Root 点击“已读 N 人”可以按需查看成员昵称、社区 ID 和首次已读时间；名单不会随消息历史下发给普通成员。“已读”只表示消息气泡曾达到可视条件，不代表用户理解、同意或完成了其中的事项。Root 停留在聊天室前台时，数量约每 8 秒自动更新；点击徽标或弹窗内刷新可立即读取最新名单，不需要刷新整个页面、点击后才更新数量或切换模块。</p><p>这两项能力需要管理员显式开启功能开关；关闭时既有历史、聚合数和成员名单不会被删除，但暂时不能新建投票、投票或记录新的逐消息已读。</p>';

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

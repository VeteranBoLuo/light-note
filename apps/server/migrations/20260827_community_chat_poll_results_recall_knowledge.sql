-- 2026-08-27 聊天室投票结果、已读与撤回帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @community_chat_poll_receipt_help_id = 'fd9b4629-a745-4906-8b54-5cea6cb0cd48';
SET @community_chat_poll_receipt_help_title = '聊天室投票和发言已读如何使用';
SET @community_chat_poll_receipt_help_content = '<h1>Root 发起，成员参与</h1><p>聊天室的“发起投票”和“统计这条发言的已读人数”只对 Root 开放。普通登录用户可以参与尚未结束的投票，并在截止前修改选择；游客可以阅读投票，但不能投票。</p><h2>单选与多选</h2><p>Root 发布时可以选择单选或多选。单选投票中，每位成员只能选择 1 项，点击选项后立即提交；多选投票还要设置每人最多可选项数，成员选择 1 项至该上限后一次提交完整选择。更新多选时会以最新提交的完整选择为准，不会把多次提交累加成额外票数。</p><h2>发起和结束投票</h2><p>Root 创建投票时需要填写问题、2～10 个不重复的选项和截止时间。截止时间最早为 5 分钟后，最长为 30 天。Root 可以在截止前提前结束投票；结束后不能再投票或改票。</p><h2>结果什么时候可见</h2><p>Root 在投票期间就能查看聚合票数；普通登录用户完成自己的首次投票后即可看到各选项票数、比例和去重后的总参与人数，尚未投票时不显示进行中的结果。投票结束后，所有读者都能查看聚合结果。多选比例按参与人数计算，因此各选项比例相加可能超过 100%。</p><p>普通用户不会看到谁投了哪一项。Root 可以点击投票卡片中的“投票明细”，选择某个选项后按需查看该选项的成员公开昵称和社区 ID；名单不会随消息历史或投票结果下发。</p><h2>“已读”代表什么</h2><p>逐消息已读开关开启时，新发送的 Root 消息和投票会自动统计。普通成员界面不显示逐消息已读提示，但记录规则不变：登录用户只有在页面位于前台、浏览器获得焦点，并让消息气泡连续出现在可视区域至少 0.8 秒后，系统才把该账号计为一人；只进入聊天室、只露出头像昵称、快速划过或切到后台都不计入。重复查看不会重复增加，作者本人和游客也不计入。</p><p>Root 可以看到“已读 N 人”，并点击查看成员昵称、社区 ID 和首次已读时间。“已读”只表示消息气泡曾达到可视条件，不代表用户理解、同意或完成了其中的事项。Root 停留在聊天室前台时，数量约每 8 秒自动更新；点击徽标或弹窗内刷新可以立即读取最新名单，不需要刷新整个页面或切换模块。</p><h2>撤回后如何显示</h2><p>撤回消息会压缩为居中的系统提示：本人看到“你撤回了一条消息”，其他人看到对应昵称的撤回提示，管理员代撤回会显示管理员操作。普通消息流不再保留头像、身份信息、时间和空白气泡。Root 需要审核时可以主动展开原消息并再次收起；每位登录用户仍可以把这条撤回记录从自己的会话中删除。</p><p>投票和已读能力需要管理员显式开启功能开关；关闭时既有历史、聚合数和成员名单不会被删除，但暂时不能新建投票、投票或记录新的逐消息已读。</p>';

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

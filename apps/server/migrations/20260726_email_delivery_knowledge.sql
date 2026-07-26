-- 2026-07-26 管理员邮件发送记录内部知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @email_delivery_id = '11a55dce-8790-41e5-8c7c-b031b0f535bd';
SET @email_delivery_title = '管理员通知中心：邮件发送记录与状态含义';
SET @email_delivery_content = '<h2>邮件发送记录</h2><p>Root 管理员可以在“通知中心”切换到“邮件发送”，查看轻笺发出的验证码和待办提醒邮件。页面支持按邮件类型、状态、收件邮箱、主题、用户和日期筛选，并可打开单条记录查看 SMTP 受理时间、服务商消息 ID、关联用户或待办以及脱敏错误摘要。</p><h3>状态含义</h3><ul><li>发送中：邮件正在提交给 SMTP 服务；</li><li>SMTP 已受理：SMTP 服务已经接受发送请求，但不代表邮件一定进入收件箱，也不代表用户已经阅读；</li><li>发送失败：SMTP 明确返回失败，详情会展示稳定错误码和脱敏摘要；</li><li>状态未知：发送中的进程在状态回写前中断，系统无法安全判断最终结果。</li></ul><h3>数据和权限边界</h3><p>该功能仅对 Root 普通管理上下文开放，管理员预览目标账号时不能读取。列表默认脱敏收件邮箱，详情用于管理员排障。系统不会把验证码、SMTP 凭据或完整邮件正文保存到发送记录，也不提供收取系统邮箱来信、写信、回复或手动重发能力。记录默认保留 180 天，只覆盖功能上线后经统一发送服务发出的邮件。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @email_delivery_id, @email_delivery_title, @email_delivery_content,
  '内部知识', 'internal', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @email_delivery_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @email_delivery_id);

UPDATE knowledge_base
SET content = @email_delivery_content,
    category = '内部知识',
    status = 'internal',
    type = 'html',
    sort = 96,
    updated_by = NULL
WHERE id = @email_delivery_id OR title = @email_delivery_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @email_delivery_id OR title = @email_delivery_title;

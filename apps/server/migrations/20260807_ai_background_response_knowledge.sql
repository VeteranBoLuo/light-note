-- 2026-08-07 AI 助手跨导航后台回复说明（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_background_response_id = 'd4077811-4e89-4ba8-aac0-6aab7b341d68';
SET @ai_background_response_title = 'AI 助手切换页面后会继续回答吗';
SET @ai_background_response_content = '<h1>切换模块不会停止回答</h1><p>在轻笺移动端或桌面端提交问题后，可以切换到今日、资料、待办等其他模块，AI 助手会继续在当前应用会话中生成回答。再次进入 AI 助手时，会显示当前进度或已经完成的完整结果。</p><h2>如何查看状态</h2><p>移动端底部 AI 入口会显示生成中、已完成、待处理或失败状态；进入 AI 工作区后，已完成提示会自动确认。</p><h2>哪些操作会停止回答</h2><p>只有主动点击停止、新建或切换对话、登录或退出账号、切换管理员上下文时，当前回答才会被中止。刷新页面、强制关闭应用或系统回收 WebView 属于连接中断，不能保证继续生成。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_background_response_id, @ai_background_response_title, @ai_background_response_content,
  '帮助中心', 'public', 'html', 923, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_background_response_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_background_response_title);

UPDATE knowledge_base
SET content = @ai_background_response_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 923,
    updated_by = NULL
WHERE id = @ai_background_response_id OR title = @ai_background_response_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @ai_background_response_id;

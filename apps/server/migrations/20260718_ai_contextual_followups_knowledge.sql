-- 2026-07-18 AI 上下文快捷追问帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @follow_up_id = 'b11c6c23-78b4-4c8a-8b25-71c2c535a28d';
SET @follow_up_title = '轻笺智域：快捷提问与回答后的相关追问';
SET @follow_up_content = '<h2>首屏快捷提问</h2><p>新建对话时，轻笺智域会根据当前所在页面展示 3 条高价值快捷提问，例如近期知识回顾、书签有效性、云空间用量、笔记待办和成长奖励。快捷提问是“一键提问”，点击后会立即发送，不需要再手动点击发送按钮。</p><h2>回答后的相关追问</h2><p>完成一次正常回答后，助手会根据本轮用户问题、回答结论、引用来源类型和工具结果，自动生成 3 条与当前内容相关的后续问题。相关追问在主回答结束后异步生成，不会拖慢正文展示，也不会计入用户界面显示的 AI 额度。</p><p>追问只使用本轮截断后的必要上下文，不会重新上传完整聊天记录或完整私密文件；短时上下文按账号和请求隔离，过期后自动清理。</p><h2>降级与安全</h2><p>如果相关追问生成超时、服务异常或返回内容不合格，界面会自动改用与当前结果或所在页面相关的固定问题，不影响继续聊天。写入、移动、删除等操作即使由快捷追问触发，仍必须经过原有选择卡或最终确认卡，快捷提问不会绕过写操作确认。</p><p>当助手正在等待用户完成单选、多选或写操作确认时，不展示普通追问，避免与当前待处理动作冲突。错误回答、过短回答和主动停止的回答也不会生成动态追问。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @follow_up_id, @follow_up_title, @follow_up_content,
  '帮助中心', 'public', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @follow_up_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @follow_up_id);

UPDATE knowledge_base
SET content = @follow_up_content, category = '帮助中心', status = 'public', type = 'html', sort = 96, updated_by = NULL
WHERE id = @follow_up_id OR title = @follow_up_title;

-- 修正旧附件帮助文档中“回答后随机推荐”的过时描述，避免两篇知识互相矛盾。
UPDATE knowledge_base
SET content = REPLACE(
  content,
  '对话中的常见问题和“你还可以继续问”随机推荐项属于一键提问，点击后会直接发送。',
  '新对话中的常见问题和回答后根据上下文生成的“你还可以继续问”都属于一键提问，点击后会直接发送；动态生成失败时会自动使用固定问题降级。'
)
WHERE id = 'af0850a6-6ae8-49ae-bd15-1c337d624dc7'
   OR title = '轻笺智域：上传文件进行摘要、问答和生成笔记';

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @follow_up_id OR title = @follow_up_title;

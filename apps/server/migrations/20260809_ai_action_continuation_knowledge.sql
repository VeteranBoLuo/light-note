-- 2026-08-09 轻笺智域确认卡动作续答说明（MySQL 5.7 兼容、幂等）。
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_action_continuation_help_id = '0ea0fbc9-6ac3-4d52-a929-cbc06c8bce86';
SET @ai_action_continuation_help_title = '轻笺智域：确认操作后为什么会继续回答';
SET @ai_action_continuation_help_content = '<h2>确认卡与后续回答</h2><p>轻笺智域执行创建笔记、书签、标签、待办或其他写操作前，仍会先展示确认卡。纯创建、更新或删除请求在你确认成功后，只展示一次服务端权威结果，不会再调用 AI 把同一句话改写一遍。只有原问题同时包含尚未回答的分析、说明或建议时，助手才会在原卡片下方继续完成这部分内容。</p><h2>不会伪造用户消息</h2><p>自动续答是受会话和账号绑定的内部协议事件，不会替你发送“继续回答”之类的用户消息，也不会把内部控制文案写入本地或云端会话。后续回答只读取服务端保存的原问题、必要的查询摘要和成功回执，不会重新进入工具规划，也不会再次创建或修改资源。</p><h2>可信结果</h2><p>卡片中的操作结果始终以确认接口返回的权威回执为准，续答只处理尚未交付的非操作部分，不会重复确认或改写已经展示的操作结果；即使后续 AI 回答生成失败，已经成功的操作也不会被改成失败或自动回滚。</p><h2>什么时候不会继续</h2><ul><li>纯创建、更新、删除等操作已经由权威结果完整回答时不会调用 AI 续答。</li><li>取消、返回编辑、执行失败或写入结果仍在核验时不会调用 AI 续答。</li><li>同一回答中同时存在多张未决卡片时，当前版本会让每张卡片独立结算，不猜测执行顺序，也不会自动续答。</li><li>保存附件等结构化快捷操作保持原有确定性结果，不会为每次点击额外调用 AI。</li></ul><p>如果自动续答已经过期或暂时失败，可以直接在当前会话继续提问；请不要为了获得回答而重复点击已经成功的创建操作。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_action_continuation_help_id, @ai_action_continuation_help_title, @ai_action_continuation_help_content,
  'FAQ', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_action_continuation_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_action_continuation_help_id);

UPDATE knowledge_base
SET content = @ai_action_continuation_help_content,
    category = 'FAQ',
    status = 'public',
    type = 'html',
    sort = 95,
    updated_by = NULL
WHERE id = @ai_action_continuation_help_id OR title = @ai_action_continuation_help_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id = @ai_action_continuation_help_id OR title = @ai_action_continuation_help_title;

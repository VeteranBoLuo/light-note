-- 单资源 AI 排除功能已取消，清理历史偏好表与过时帮助内容。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @ai_scope_help_id = 'b14e9846-ad31-4cd2-a75f-b88b132ac286';
SET @ai_scope_help_old_title = '轻笺智域的作用范围、资源排除与依据边界';
SET @ai_scope_help_title = '轻笺智域的作用范围与依据边界';
SET @ai_scope_help_content = '<h1>轻笺智域的作用范围与依据边界</h1><p>轻笺智域可以检索当前账号有权访问的笔记、书签和云文件，也可以读取你在输入区明确添加的资源或上传文件，用于摘要、问答和整理。未添加的材料仍可能通过账号内检索被找到；回答会根据实际命中的内容标注来源。</p><h2>回答边界</h2><p>回答会说明实际使用的资源、覆盖数量、截断或权限边界。没有检索到账号内依据时，轻笺智域会明确说明未找到，不会把通用知识包装成你的账号事实。引用表示答案绑定了具体来源和位置；引用是否充分支持主张仍会通过离线评测和人工抽检持续检查。</p><h2>会话与配额</h2><p>会话侧栏支持搜索、置顶、文件夹和归档筛选。配额默认显示已用百分比和大致可用轮次，Token 明细可展开查看。当前长期记忆关闭，系统不会新增或使用记忆；历史数据导出是独立的数据管理能力。</p>';

UPDATE knowledge_base
SET title = @ai_scope_help_title,
    content = @ai_scope_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 95,
    updated_by = NULL
WHERE id = @ai_scope_help_id
   OR title IN (@ai_scope_help_old_title, @ai_scope_help_title);

DROP TABLE IF EXISTS ai_resource_preferences;

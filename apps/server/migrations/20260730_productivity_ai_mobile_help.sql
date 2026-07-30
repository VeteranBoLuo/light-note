-- 2026-07-30 待办效率、AI 作用范围与响应式笔记目录帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @todo_help_id = '922db67b-23c2-4ee5-a51c-8af94356e53a';
SET @todo_help_title = '待办分组、重复任务、提醒与撤销';
SET @todo_help_content = '<h1>待办分组、重复任务、提醒与撤销</h1><p>待办页会把任务按逾期、今天、即将到来、以后、无日期和已完成分组，并提供议程与日历视图。电脑端非空列表也会保留“新建待办”，还可使用行内快速创建。</p><h2>调整与稍后提醒</h2><p>你可以修改优先级，或拖动待办调整日期、优先级和同组顺序。“稍后提醒”支持 10 分钟后、明天和下周。ICS 导出是当时状态的静态文件，后续修改不会自动同步到日历软件。</p><h2>重复任务和周期提醒的区别</h2><p>重复任务会在当前实例完成后，按日、周或月创建下一实例并重置清单；周期提醒只会对同一个任务按间隔重复通知。两者可以独立设置。完成当前实例会暂停其未触发提醒，并把对应计划平移到新实例。</p><h2>撤销</h2><p>单条和批量完成、删除后会短时提供撤销。撤销由服务器校验并整体执行：撤销完成会恢复当前任务与提醒，并移除本次自动生成且尚未变化的下一实例；撤销删除会恢复任务及其暂停的提醒。</p><h2>通知设置</h2><p>设置页可分别控制站内、邮件和浏览器通知，并设置免打扰时段。浏览器通知需要系统授权，且只在轻笺页面已打开时展示；免打扰按当前设备同步的时区计算。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @todo_help_id, @todo_help_title, @todo_help_content,
  '帮助中心', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_help_id);

UPDATE knowledge_base
SET content = @todo_help_content, category = '帮助中心', status = 'public', type = 'html', sort = 95, updated_by = NULL
WHERE id = @todo_help_id OR title = @todo_help_title;

SET @ai_scope_help_id = 'b14e9846-ad31-4cd2-a75f-b88b132ac286';
SET @ai_scope_help_title = '轻笺智域的作用范围与依据边界';
SET @ai_scope_help_content = '<h1>轻笺智域的作用范围与依据边界</h1><p>轻笺智域可以检索当前账号有权访问的笔记、书签和云文件，也可以读取你在输入区明确添加的资源或上传文件，用于摘要、问答和整理。未添加的材料仍可能通过账号内检索被找到；回答会根据实际命中的内容标注来源。</p><h2>回答边界</h2><p>回答会说明实际使用的资源、覆盖数量、截断或权限边界。没有检索到账号内依据时，轻笺智域会明确说明未找到，不会把通用知识包装成你的账号事实。引用表示答案绑定了具体来源和位置；引用是否充分支持主张仍会通过离线评测和人工抽检持续检查。</p><h2>会话与配额</h2><p>会话侧栏支持搜索、置顶、文件夹和归档筛选。配额默认显示已用百分比和大致可用轮次，Token 明细可展开查看。当前长期记忆关闭，系统不会新增或使用记忆；历史数据导出是独立的数据管理能力。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_scope_help_id, @ai_scope_help_title, @ai_scope_help_content,
  '帮助中心', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_scope_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_scope_help_id);

UPDATE knowledge_base
SET content = @ai_scope_help_content, category = '帮助中心', status = 'public', type = 'html', sort = 95, updated_by = NULL
WHERE id = @ai_scope_help_id OR title = @ai_scope_help_title;

SET @mobile_catalog_help_id = '86186599-c6bf-4b90-a333-41b364fb09a2';
SET @mobile_catalog_help_title = '手机和平板查看长笔记目录';
SET @mobile_catalog_help_content = '<h1>手机和平板查看长笔记目录</h1><p>当笔记正文包含标题时，手机和平板或中等宽度窗口的笔记顶栏会显示目录按钮。点按后从底部打开“笔记目录”，并自动定位到当前阅读章节；完整桌面布局则显示常驻侧边目录。</p><p>目录会按标题层级缩进，当前章节随正文滚动高亮。点按任一标题可跳到对应正文并自动收起目录；也可以使用关闭按钮、点按遮罩或按 Escape 关闭。正文没有标题时不会显示目录入口。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @mobile_catalog_help_id, @mobile_catalog_help_title, @mobile_catalog_help_content,
  '帮助中心', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @mobile_catalog_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @mobile_catalog_help_id);

UPDATE knowledge_base
SET title = @mobile_catalog_help_title, content = @mobile_catalog_help_content, category = '帮助中心', status = 'public', type = 'html', sort = 95, updated_by = NULL
WHERE id = @mobile_catalog_help_id OR title IN (@mobile_catalog_help_title, '移动端查看长笔记目录');

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@todo_help_id, @ai_scope_help_id, @mobile_catalog_help_id);

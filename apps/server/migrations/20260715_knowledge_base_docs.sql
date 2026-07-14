-- 2026-07-15 新功能知识库说明（MySQL 5.7 兼容）
-- 这是线上数据写入脚本，不随结构迁移或 deploy.sh 自动执行。
-- 执行前必须单独获得知识库数据变更授权。

START TRANSACTION;

SET @inbox_doc_id = '5f83a51e-41b2-4ad7-993f-52aa40b8795f';
SET @inbox_doc_title = '快速收集与待整理箱怎么使用';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @inbox_doc_id,
  @inbox_doc_title,
  '<h2>快速收集与待整理箱</h2><p>待整理箱用于先收集、后整理。你可以从顶部导航的“快速收集”入口保存网址、文字或文件，也可以在已有书签、笔记和文件的操作菜单中选择“加入待整理”。</p><ul><li>输入网址：创建或复用已有书签并加入待整理。</li><li>输入文字：创建 Markdown 笔记并加入待整理。</li><li>选择文件：完成容量校验和上传后加入待整理。</li></ul><p>进入“待整理”页面后，可以按类型筛选、搜索、批量标记完成，或打开原资源继续补充标题、标签和内容。标记完成只会移出待整理箱，不会删除原资源。游客展示账号为只读，注册并登录后才能使用自己的待整理箱。</p>',
  '帮助中心',
  'public',
  'html',
  90,
  NULL,
  NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE title = @inbox_doc_title
);

UPDATE knowledge_base
SET
  content = '<h2>快速收集与待整理箱</h2><p>待整理箱用于先收集、后整理。你可以从顶部导航的“快速收集”入口保存网址、文字或文件，也可以在已有书签、笔记和文件的操作菜单中选择“加入待整理”。</p><ul><li>输入网址：创建或复用已有书签并加入待整理。</li><li>输入文字：创建 Markdown 笔记并加入待整理。</li><li>选择文件：完成容量校验和上传后加入待整理。</li></ul><p>进入“待整理”页面后，可以按类型筛选、搜索、批量标记完成，或打开原资源继续补充标题、标签和内容。标记完成只会移出待整理箱，不会删除原资源。游客展示账号为只读，注册并登录后才能使用自己的待整理箱。</p>',
  category = '帮助中心',
  status = 'public',
  type = 'html',
  sort = 90,
  updated_by = NULL
WHERE title = @inbox_doc_title;

SET @admin_doc_id = 'c50b6d73-f0a8-4ced-b42a-c2ddfd394abe';
SET @admin_doc_title = '管理员只读预览与内容代管';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @admin_doc_id,
  @admin_doc_title,
  '<h2>管理员用户上下文</h2><p>用户管理提供两个严格分离的入口：</p><ul><li><strong>只读预览</strong>：默认入口，只能查看目标用户的书签、笔记、文件和标签，任何业务写入都应由服务端拒绝。</li><li><strong>内容代管</strong>：必须由 root 显式选择并确认，只允许维护可逆的内容数据；账号、安全、权益、通知、永久删除等操作始终禁止。</li></ul><p>上下文由服务端签发短期令牌并绑定真实 root 会话。业务资源归属于被代管用户，审计记录归属于操作管理员；代管不得消耗目标用户的成长、积分、转化或 AI 额度。发现越权、审计缺失或上下文异常时，应立即关闭 ADMIN_MAINTENANCE_ENABLED。</p>',
  '内部运维',
  'internal',
  'html',
  900,
  NULL,
  NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE title = @admin_doc_title
);

UPDATE knowledge_base
SET
  content = '<h2>管理员用户上下文</h2><p>用户管理提供两个严格分离的入口：</p><ul><li><strong>只读预览</strong>：默认入口，只能查看目标用户的书签、笔记、文件和标签，任何业务写入都应由服务端拒绝。</li><li><strong>内容代管</strong>：必须由 root 显式选择并确认，只允许维护可逆的内容数据；账号、安全、权益、通知、永久删除等操作始终禁止。</li></ul><p>上下文由服务端签发短期令牌并绑定真实 root 会话。业务资源归属于被代管用户，审计记录归属于操作管理员；代管不得消耗目标用户的成长、积分、转化或 AI 额度。发现越权、审计缺失或上下文异常时，应立即关闭 ADMIN_MAINTENANCE_ENABLED。</p>',
  category = '内部运维',
  status = 'internal',
  type = 'html',
  sort = 900,
  updated_by = NULL
WHERE title = @admin_doc_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE title IN (@inbox_doc_title, @admin_doc_title)
ORDER BY title;

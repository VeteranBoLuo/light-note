-- 2026-08-22 Root 服务器管理帮助文档更新（MySQL 5.7 兼容、幂等）
-- 复用 20260820_server_management_knowledge.sql 的固定知识 ID，不创建第二条服务器管理文档。
-- 仅同步 knowledge_base 内部知识，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @server_management_help_id = 'd9f39495-49d2-4c07-a50c-542fc10df215';
SET @server_management_help_title = '服务器管理：本机状态、受限日志与安全运维操作';
SET @server_management_help_content = '<h1>服务器管理</h1><p>服务器管理只对 Root 管理员开放，用于维护轻笺当前所在主机。电脑端入口位于“后台管理”左侧目录最下面；移动端可从个人中心进入。</p><h2>诊断与处置</h2><p>“诊断与处置”会按需汇总运行概览、固定服务、存储与安全检查，按照异常、预警、待确认和通过排列。数据源局部不可用时只把对应检查标为待确认，不会把未知误报成通过。问题卡片会跳转到权威详情页，处理后应重新运行诊断确认恢复。</p><h2>服务进程与日志</h2><p>“服务进程”是固定服务状态、日志和安全写操作的唯一入口。可以按名称或状态筛选服务；日志支持固定行数、关键词、错误/警告/信息级别、3 秒/10 秒/30 秒自动刷新、复制和导出。日志只读、限制大小并经过脱敏，不支持任意文件路径。</p><h2>安全操作</h2><p>写操作仅开放三个固定 Worker 重启和 Nginx 配置校验后重载。轻笺 API、MySQL 和 Redis 不能从页面重启。每次操作都要求填写原因并确认，系统使用幂等任务避免网络重试导致重复执行；完成后会展示任务回执和服务状态核验。</p><h2>安全、存储与审计</h2><p>安全页逐项展示可验证事实、证据和处理建议，不使用不透明评分；存储页展示受监控挂载点、inode 和磁盘 IO，不开放任意文件浏览。“操作审计”记录写操作意图、结果和原因，支持搜索、结果筛选和导出。</p><h2>边界</h2><p>页面不会连接 SSH、执行任意命令或保存账号密码。网站或主 API 完全不可用时，紧急恢复仍需通过人工服务器运维渠道完成。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @server_management_help_id, @server_management_help_title, @server_management_help_content,
  '内部知识', 'internal', 'html', 920, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @server_management_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @server_management_help_title);

UPDATE knowledge_base
SET title = @server_management_help_title,
    content = @server_management_help_content,
    category = '内部知识',
    status = 'internal',
    type = 'html',
    sort = 920,
    updated_by = NULL
WHERE id = @server_management_help_id;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @server_management_help_id;

-- 执行后通过统一知识库写服务使缓存失效，或等待最多 5 分钟安全 TTL；不要把数据库凭据写进迁移文件。

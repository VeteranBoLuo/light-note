-- 2026-08-20 Root 服务器管理帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 内部知识，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @server_management_help_id = 'd9f39495-49d2-4c07-a50c-542fc10df215';
SET @server_management_help_title = '服务器管理：本机状态、受限日志与安全运维操作';
SET @server_management_help_content = '<h1>服务器管理</h1><p>Root 管理员可以从电脑端顶部「管理 → 服务器管理」进入；手机端在个人中心的「管理工具」中进入。这个页面只管理轻笺当前所在服务器，用于查看运行状态和执行少量经过限制的运维动作。</p><h2>可以查看什么</h2><p>页面展示 CPU、1 分钟负载、内存、根磁盘、网络收发速率和最近 60 分钟趋势，并列出轻笺 API、三个异步 Worker、Nginx、MySQL 和 Redis 的状态。服务日志只读取固定服务的最近内容，会限制行数和总大小并隐藏常见密码、Token、连接串凭据、JWT 和私钥内容；它不是文件管理器或终端。</p><h2>可以执行什么</h2><p>当前只允许两类操作：Nginx 配置校验通过后重载；重启文档处理、书签图标和资源治理三个 Worker。轻笺 API、MySQL 和 Redis 只能查看，不能从页面重启。每次操作都要求 Root 填写至少 6 个字的原因并显式确认，系统会记录操作意图和最终结果；网络重试会复用幂等回执，不会把同一次确认重复执行。如果 Agent 在动作执行期间中断，回执会保留为「结果未知」并阻止自动重放，此时应先人工核验服务实际状态。</p><h2>Agent 离线、部分采集失败和协议不兼容</h2><p>Host Agent 是服务器上的独立本机采集进程，不是 AI。Agent 离线时页面会明确显示不可用并隐藏操作能力；某个采集器失败时，其余数据继续显示并标注失败来源；前后端协议版本不一致时全部操作失败关闭。页面不会退化为 SSH，也不会发送任意命令。</p><h2>安全边界与应急恢复</h2><p>浏览器只访问轻笺后台，后台通过本机 Unix Socket 调用 Agent；Agent 不开放公网端口，不保存 SSH、数据库、Redis 或对象存储账号，也不加载业务环境文件。由于 v1 与轻笺网站部署在同一台主机，网站或主 API 完全不可用时服务器管理页也不可用，紧急恢复仍需有权限的运维人员通过人工 SSH 处理。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @server_management_help_id, @server_management_help_title, @server_management_help_content,
  '内部知识', 'internal', 'html', 920, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @server_management_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @server_management_help_id);

UPDATE knowledge_base
SET title = @server_management_help_title,
    content = @server_management_help_content,
    category = '内部知识',
    status = 'internal',
    type = 'html',
    sort = 920,
    updated_by = NULL
WHERE id = @server_management_help_id OR title = @server_management_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @server_management_help_id;

-- 执行后通过统一知识库写服务使缓存失效，或等待最多 5 分钟安全 TTL；不要把数据库凭据写进迁移文件。

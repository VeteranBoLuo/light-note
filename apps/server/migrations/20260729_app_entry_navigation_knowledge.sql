-- 2026-07-29 官网、应用入口与移动端导航帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @app_entry_id = '7db7baca-6c78-4d88-93f9-8e6a0d95c8e1';
SET @app_entry_title = '轻笺官网、应用入口与移动端资料导航';
SET @app_entry_content = '<h1>轻笺官网与应用入口</h1><p>在普通浏览器中访问 <a href="/">轻笺根地址</a> 会打开产品官网。未登录的手机用户可以先了解功能、体验示例或注册；已经登录的手机用户再次访问根地址时，会直接回到轻笺资料区。电脑端如需直接进入应用，可以访问 <a href="/app">/app</a>。</p><h2>Android 与 PWA</h2><p>轻笺 Android 版和已经安装的 PWA 都按应用方式启动，不展示营销官网。启动后会进入最近使用的书签、笔记库或云空间；没有最近记录时默认进入书签。</p><h2>移动端“资料”入口</h2><p>底部导航的“资料”代表书签、笔记库和云空间三个资源模块。点击后优先回到最近访问的资料模块。移动端顶部的轻笺 Logo 与“资料”入口行为一致，不会跳回官网。</p><h2>登录与退出</h2><p>在手机浏览器完成登录或注册后会进入资料区。普通浏览器退出登录后回到官网；Android 版和 PWA 会留在应用界面内显示登录流程，不会跳到营销页。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @app_entry_id, @app_entry_title, @app_entry_content,
  '帮助中心', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @app_entry_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @app_entry_id);

UPDATE knowledge_base
SET content = @app_entry_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 95,
    updated_by = NULL
WHERE id = @app_entry_id OR title = @app_entry_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @app_entry_id OR title = @app_entry_title;

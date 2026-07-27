-- 2026-07-27 轻笺 PWA 安装帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @pwa_install_id = '7e3f9f01-8a65-4e76-99cc-e36cf5926ec9';
SET @pwa_install_title = '如何把轻笺安装到桌面或主屏幕';
SET @pwa_install_content = '<h1>把轻笺安装到设备</h1><p>轻笺是网页应用，可以通过浏览器安装到电脑桌面、手机桌面或应用列表，无需下载 APK，也不需要经过应用商店。安装后的账号、数据和网页端保持一致，并会随网站更新。</p><h2>从哪里打开安装教程</h2><ul><li>手机端：进入底部“我的”，点击“安装轻笺”；</li><li>电脑端：可从官网安装入口或轻笺“设置”中的桌面安装区域打开；</li><li>已经安装后仍可重新打开教程，查看其他设备的添加方式。</li></ul><h2>优先尝试一键安装</h2><p>打开教程后点击“一键安装”。如果当前浏览器已经为轻笺开放网页应用安装能力，系统会显示自己的安装确认框；选择“安装”即可。系统确认框仍在等待用户选择时，轻笺不会用超时把它误判为失败。用户取消后也不会重复弹出提示。</p><p>如果浏览器没有开放安装接口、明确报错或返回异常结果，轻笺会提示改用教程中的浏览器菜单方式。网站不能绕过浏览器或操作系统强制安装，因此不同浏览器的能力和菜单名称可能不同。</p><h2>通过浏览器菜单添加</h2><ul><li>鸿蒙或华为设备：打开浏览器网页菜单，查找“安装应用”“添加至桌面”或“添加到主屏幕”；</li><li>Android 的 Chrome、Edge 等浏览器：打开浏览器菜单，选择“安装应用”或“添加到主屏幕”；</li><li>iPhone 或 iPad：建议用 Safari 打开轻笺，通过分享菜单选择“添加到主屏幕”；</li><li>电脑端 Chrome、Edge 等浏览器：使用地址栏的安装图标，或在浏览器菜单中查找“安装应用”。</li></ul><p>夸克、Firefox、360、QQ、UC、百度、搜狗等浏览器的入口名称会因版本不同而变化。若菜单中没有“安装应用”“添加到主屏幕”或“添加到桌面”，可改用最新版 Chrome、Edge、Safari 或设备系统浏览器。</p><h2>安装后的使用边界</h2><p>安装只会为同一个轻笺网站创建更像 App 的独立入口，不会生成另一套账号或复制数据。轻笺不会缓存登录用户的私有业务接口和内容；离线时会显示离线说明，恢复网络后即可继续使用。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @pwa_install_id, @pwa_install_title, @pwa_install_content,
  '帮助中心', 'public', 'html', 105, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @pwa_install_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @pwa_install_id);

UPDATE knowledge_base
SET content = @pwa_install_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 105,
    updated_by = NULL
WHERE id = @pwa_install_id OR title = @pwa_install_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @pwa_install_id OR title = @pwa_install_title;

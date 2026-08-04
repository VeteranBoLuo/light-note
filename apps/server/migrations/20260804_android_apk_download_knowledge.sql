-- 2026-08-04 轻笺 Android App 官网下载帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。
--
-- 两部分：
-- 1) 新增 Android App 下载安装说明。App 备案已通过（蜀ICP备2026017699号-3A），官网开放直接下载，
--    知识库必须能答出「怎么下载安卓版」，否则 AI 只会回答网页安装那一套。
-- 2) 修正既有 PWA 安装文档里「无需下载 APK」的表述 —— 现在确实有安装包了，照原样会让 AI
--    告诉用户轻笺没有 App。
--
-- 标题与各级小标题里同时写「Android / 安卓 / App / 安装包 / APK」等说法：
-- 检索按 title(boost 5) 与 h1/h2 heading(boost 2.5) 打分，同义词在这两处覆盖到，
-- 就不必为此改 knowledgeService 的 QUERY_ALIAS_RULES。
-- 不写死 SHA-256 与文件大小：换版本就会过时，统一引导到下载页现取。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @android_apk_id = 'b1f6c2d4-5e8a-4c73-9f21-7ad0e4c93b58';
SET @android_apk_title = '如何下载安装轻笺 Android（安卓）App 安装包';
SET @android_apk_content = '<h1>下载并安装轻笺 Android App</h1><p>轻笺的 Android 客户端已完成工信部 App 备案，可以从官网下载页 https://boluo66.top/download/android 直接下载安装包。它只支持 Android 手机，以及部分能通过卓易通等兼容环境运行 Android 安装包的鸿蒙设备；iPhone、iPad 和电脑装不了这个安装包，请改用网页安装（添加到桌面），功能与数据一致。App 与网页端是同一个账号、同一份数据，装好后不需要重新注册或导入；目前不上应用商店，只通过官网分发。</p><h2>在哪里下载 APK 安装包</h2><p>下载页地址是 https://boluo66.top/download/android 。用手机浏览器打开这个地址，点击“下载 APK”即可；在电脑上打开时页面不会直接下载，而是给出可以转发到手机的链接和“复制安装包直链”。App 内和设置里的“安装到设备”入口也能进入这个页面。</p><p>请只从 boluo66.top 下载正式版。第三方站点上同名的安装包来源不可信，也无法保证与下载页公布的校验值一致。</p><h2>支持哪些系统：Android 8.0 与鸿蒙设备</h2><p>需要 Android 8.0 及以上系统。部分支持运行 Android 安装包的鸿蒙设备，可以在具备卓易通等 Android 兼容运行环境后安装；这属于兼容运行，轻笺并没有开发鸿蒙原生应用，也有一部分鸿蒙机型确实装不上。装不上时可以改用网页安装（添加到桌面），功能一致。</p><h2>安装步骤与“未知来源”提示</h2><p>在 Android 手机上下载安装包并等待下载完成，然后打开它；如果系统询问，允许当前浏览器或文件管理器安装应用，再按系统提示完成安装。首次启动会先显示隐私政策与用户协议，同意后才会联网加载内容。</p><p>首次安装时系统可能提示“未知来源”“未经过安全检测”之类的内容，这是 Android 对所有非应用商店安装包的统一提示，属于正常现象，与是否完成备案无关；备案号只说明这个应用已经履行了备案义务，不代表系统不会给出提示。</p><h2>App 备案号</h2><p>轻笺 App 的备案号是 蜀ICP备2026017699号-3A，可以在 App 的“设置 - 隐私与协议”里看到，点击会跳转工信部备案系统 https://beian.miit.gov.cn 查询；官网下载页底部也标注了同一个号码。请注意它与网站备案号 蜀ICP备2026017699号-1 不是同一个号：带 -3A 后缀的是 App 备案号，网站备案号不能当作 App 备案号使用。</p><h2>如何校验下载到的安装包</h2><p>下载页上公布了当前线上这一个安装包的包名、版本号、文件大小、APK 的 SHA-256 校验值和正式签名证书指纹，展开“安装包校验信息”即可看到。下载后在电脑上执行 shasum -a 256 加上安装包路径，或在手机上用支持哈希计算的文件工具，把结果与下载页显示的 SHA-256 逐位对比，一致才是官网正式包。校验值会随版本更新，请以下载页当时显示的为准。</p><h2>需要哪些权限</h2><p>App 只申请联网相关的系统权限，不申请相机、相册、存储、定位、麦克风、通讯录、短信或电话权限，也不接入广告、统计或推送类第三方移动 SDK。</p><h2>如何更新与卸载</h2><p>下载新版本安装包覆盖安装即可，云端数据不会丢失。网页端的功能更新会自动生效，通常不需要重新安装 App。卸载和普通应用一样，长按桌面图标或在系统设置的应用列表里卸载；卸载只移除本机应用，云端账号与数据不受影响。</p><h2>下载或安装失败怎么办</h2><ul><li>浏览器拦截下载：部分浏览器会把安装包判定为风险文件，可在下载列表里选择继续保留，或换用系统自带浏览器重试；</li><li>提示解析安装包出现问题：通常是下载不完整，删掉已下载的文件重新下载，并核对 SHA-256；</li><li>提示应用未安装或签名冲突：如果此前装过测试版本，先卸载旧版本再安装；</li><li>鸿蒙设备无法直接安装：需要先具备卓易通等 Android 兼容运行环境，部分机型不支持，这种情况请改用网页安装。</li></ul><h2>和网页安装（添加到桌面）有什么区别</h2><p>两种方式都能得到独立的入口，账号与数据完全一致。下载 App 安装包会得到真正的本机应用，系统返回键、文件选择上传与下载体验更完整；网页安装（添加到桌面 / 安装应用）不需要下载安装包，适合 iPhone、iPad、电脑，以及装不了安装包的设备。iPhone 与 iPad 无法安装 Android 安装包，请使用网页安装。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @android_apk_id, @android_apk_title, @android_apk_content,
  '帮助中心', 'public', 'html', 107, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @android_apk_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @android_apk_id);

UPDATE knowledge_base
SET content = @android_apk_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 107,
    updated_by = NULL
WHERE id = @android_apk_id OR title = @android_apk_title;

-- 修正既有 PWA 安装文档：原文写「无需下载 APK」，App 备案通过、官网开放下载后该表述已不成立。
-- 沿用 20260727_pwa_install_knowledge.sql 的同一 id，避免产生重复条目。
SET @pwa_install_id = '7e3f9f01-8a65-4e76-99cc-e36cf5926ec9';
SET @pwa_install_title = '如何把轻笺安装到桌面或主屏幕';
SET @pwa_install_content = '<h1>把轻笺安装到设备</h1><p>轻笺可以通过浏览器安装到电脑桌面、手机桌面或应用列表，不需要经过应用商店。安装后的账号、数据和网页端保持一致，并会随网站更新。</p><h2>两种安装方式</h2><p>Android 以及部分支持 Android 安装包的鸿蒙设备，可以直接安装轻笺 Android App：从官网下载页 https://boluo66.top/download/android 获取安装包，具体见帮助文档《如何下载安装轻笺 Android（安卓）App 安装包》。iPhone、iPad、电脑，以及装不了安装包的设备，使用下面的网页安装（添加到桌面）方式，功能与数据一致。</p><h2>从哪里打开安装教程</h2><ul><li>手机端：进入底部“我的”，点击“安装轻笺”；</li><li>电脑端：可从官网安装入口或轻笺“设置”中的桌面安装区域打开；</li><li>已经安装后仍可重新打开教程，查看其他设备的添加方式。</li></ul><h2>优先尝试一键安装</h2><p>打开教程后点击“一键安装”。如果当前浏览器已经为轻笺开放网页应用安装能力，系统会显示自己的安装确认框；选择“安装”即可。系统确认框仍在等待用户选择时，轻笺不会用超时把它误判为失败。用户取消后也不会重复弹出提示。</p><p>如果浏览器没有开放安装接口、明确报错或返回异常结果，轻笺会提示改用教程中的浏览器菜单方式。网站不能绕过浏览器或操作系统强制安装，因此不同浏览器的能力和菜单名称可能不同。使用无痕或隐身窗口时，浏览器不会提供网页应用安装能力，需要在普通窗口中安装。</p><h2>通过浏览器菜单添加</h2><ul><li>鸿蒙或华为设备：打开浏览器网页菜单，查找“安装应用”“添加至桌面”或“添加到主屏幕”；</li><li>Android 的 Chrome、Edge 等浏览器：打开浏览器菜单，选择“安装应用”或“添加到主屏幕”；也可以改用官网下载页直接安装 Android App；</li><li>iPhone 或 iPad：建议用 Safari 打开轻笺，通过分享菜单选择“添加到主屏幕”；iPhone 与 iPad 无法安装 Android 安装包；</li><li>电脑端 Chrome、Edge 等浏览器：使用地址栏的安装图标，或在浏览器菜单中查找“安装应用”。</li></ul><p>夸克、Firefox、360、QQ、UC、百度、搜狗等浏览器的入口名称会因版本不同而变化。若菜单中没有“安装应用”“添加到主屏幕”或“添加到桌面”，可改用最新版 Chrome、Edge、Safari 或设备系统浏览器。</p><h2>安装后的使用边界</h2><p>网页安装只会为同一个轻笺网站创建更像 App 的独立入口，不会生成另一套账号或复制数据。轻笺不会缓存登录用户的私有业务接口和内容；离线时会显示离线说明，恢复网络后即可继续使用。</p>';

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
WHERE id IN (@android_apk_id, @pwa_install_id)
   OR title IN (@android_apk_title, @pwa_install_title);

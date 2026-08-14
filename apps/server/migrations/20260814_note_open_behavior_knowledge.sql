-- 2026-08-14 笔记打开方式设置帮助文档同步（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @feature_marker = 'data-ln-feature="note-open-behavior-v1"';
SET @feature_section = '<section data-ln-feature="note-open-behavior-v1"><h2>打开笔记时先预览还是直接编辑</h2><p>电脑端默认先在笔记库内预览已有笔记，需要修改时再点击“编辑”。如果经常打开后立即修改，可以前往“设置 → 通用”，开启“点击笔记直接编辑”；开启后，从笔记卡片、列表或页面树点击已有笔记都会直接进入编辑页。这个设置只影响电脑端，并会跟随账号保存；手机浏览器、PWA 和 Android App 始终直接进入编辑页。新建笔记以及预览页内的“编辑”按钮也始终直接进入编辑页。</p></section>';

UPDATE knowledge_base
SET content = CONCAT(COALESCE(content, ''), @feature_section), updated_by = NULL
WHERE (id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理')
  AND LOCATE(@feature_marker, COALESCE(content, '')) = 0;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb' OR title = '笔记管理';

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。
